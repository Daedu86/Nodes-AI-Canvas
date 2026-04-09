"use strict";

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createUIMessageStream, createUIMessageStreamResponse, type ModelMessage, streamText } from "ai";
import {
  getModelAttemptChain,
  getRequestedModelConfig,
  resolveModelConfig,
  type ModelResolutionMetadata,
  type ModelResolutionRunConfig,
  type Provider,
} from "@/lib/llm/config";
import { buildContextArtifactsUserMessage } from "@/lib/llm/context-builder";
import { createE2eMockChatResponse, isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import { normalizeMessages, selectMessagesForHistoryMode } from "@/lib/llm/messages";
import {
  classifyRequestError,
  createRequestErrorResponse,
  createResolvedModelHeaders,
} from "@/lib/llm/request-errors";
import {
  createLanguageModel,
  getMissingProviderCredential,
  getRequestModelOverrides,
} from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import {
  createLlmAuditContext,
  logLlmAuditAccepted,
  logLlmAuditCompleted,
  logLlmAuditFailed,
  logLlmAuditRejected,
} from "@/lib/server/llm-audit";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { normalizeLlmContextArtifacts } from "@/lib/session-artifacts";

export const runtime = "nodejs";
export const maxDuration = 60;
const REQUEST_ID_HEADER = "x-nodes-request-id";

type ChatRequestBody = {
  messages?: unknown;
  system?: string;
  tools?: Parameters<typeof frontendTools>[0];
  runConfig?: ModelResolutionRunConfig;
  metadata?: ModelResolutionMetadata;
  historyMode?: string;
  model?: string;
  provider?: Provider;
};

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json()) as ChatRequestBody;
  const requestOverrides = getRequestModelOverrides(req);
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = normalizeMessages(rawMessages);
  const system = body.system;
  const tools = body.tools;
  const contextArtifacts = normalizeLlmContextArtifacts(
    body.metadata?.custom?.contextArtifacts ??
      body.runConfig?.custom?.contextArtifacts,
  );

  const historyMode =
    body.metadata?.custom?.historyMode ??
    body.metadata?.historyMode ??
    body.runConfig?.custom?.historyMode ?? body.runConfig?.historyMode ?? body.historyMode;
  const messagesToSend = selectMessagesForHistoryMode(messages, historyMode);
  const requestedModel = getRequestedModelConfig(body);
  const auditContext = createLlmAuditContext({
    contextArtifactCount: contextArtifacts.length,
    historyMode: typeof historyMode === "string" ? historyMode : null,
    requested: requestedModel,
    route: "/api/chat",
    user: guarded.user,
  });

  if (messagesToSend.length === 0) {
    const stream = createUIMessageStream({
      execute() {},
    });
    return createUIMessageStreamResponse({ stream });
  }

  const quota = reserveChatQuota(guarded.user.id);
  if (!quota.ok) {
    logLlmAuditRejected(
      auditContext,
      quota.rejection.code,
      Date.now() - auditContext.startedAt,
    );
    return createRequestErrorResponse({
      code: quota.rejection.code,
      headers: {
        [REQUEST_ID_HEADER]: auditContext.requestId,
        ...Object.fromEntries(quota.rejection.headers.entries()),
      },
      message: quota.rejection.message,
      status: quota.rejection.status,
    });
  }

  logLlmAuditAccepted(auditContext);

  if (isE2eMockLlmEnabled()) {
    const { modelId, provider } = resolveModelConfig(body);
    const response = createE2eMockChatResponse(messagesToSend, {
      contextArtifacts,
      historyMode,
      modelId,
      provider,
    });
    quota.grant.release();
    logLlmAuditCompleted(auditContext, { modelId, provider });
    const headers = new Headers(response.headers);
    headers.set(REQUEST_ID_HEADER, auditContext.requestId);
    quota.grant.headers.forEach((value, key) => headers.set(key, value));
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  const primaryModel = resolveModelConfig(body);
  const attemptChain = getModelAttemptChain(primaryModel);
  const toolset = tools ? { ...frontendTools(tools) } : undefined;
  let lastError: ReturnType<typeof classifyRequestError> | null = null;

  for (let index = 0; index < attemptChain.length; index += 1) {
    const currentModel = attemptChain[index]!;
    const fallbackApplied =
      index > 0 ||
      currentModel.modelId !== requestedModel.modelId ||
      currentModel.provider !== requestedModel.provider;

    const missingCredential = getMissingProviderCredential(currentModel.provider, requestOverrides);
    if (missingCredential) {
      console.error(`Missing provider credential for ${currentModel.provider}`);
      quota.grant.release();
      logLlmAuditFailed(
        auditContext,
        currentModel,
        missingCredential.code,
        fallbackApplied,
        Date.now() - auditContext.startedAt,
      );
      return createRequestErrorResponse({
        code: missingCredential.code,
        headers: { [REQUEST_ID_HEADER]: auditContext.requestId },
        message: missingCredential.message,
        status: missingCredential.status,
      });
    }

    try {
      let finalized = false;
      const finalizeFailure = (errorCode: string) => {
        if (finalized) return;
        finalized = true;
        quota.grant.release();
        logLlmAuditFailed(
          auditContext,
          currentModel,
          errorCode,
          fallbackApplied,
          Date.now() - auditContext.startedAt,
        );
      };
      const finalizeSuccess = (totalTokens?: number | null) => {
        if (finalized) return;
        finalized = true;
        quota.grant.release();
        logLlmAuditCompleted(auditContext, currentModel, {
          fallbackApplied,
          totalTokens: totalTokens ?? null,
        });
      };

      const model = createLanguageModel(
        currentModel,
        requestOverrides,
      ) as Parameters<typeof streamText>[0]["model"];

      const artifactContextMessage = buildContextArtifactsUserMessage(contextArtifacts, {
        modelId: currentModel.modelId,
        provider: currentModel.provider,
      });
      const modelMessages = messagesToSend.map(
        ({ role, content }) =>
          ({
            role,
            content,
          }) satisfies ModelMessage,
      );
      const resolvedMessages = artifactContextMessage
        ? [artifactContextMessage satisfies ModelMessage, ...modelMessages]
        : modelMessages;

      const result = streamText({
        model,
        messages: resolvedMessages,
        system,
        tools: toolset,
        onError: (error) => {
          console.error(error);
          const classified = classifyRequestError(error, currentModel);
          finalizeFailure(classified.code);
        },
        onFinish: (event: unknown) => {
          const totalTokens =
            event &&
            typeof event === "object" &&
            "usage" in event &&
            event.usage &&
            typeof event.usage === "object" &&
            "totalTokens" in event.usage &&
            typeof event.usage.totalTokens === "number"
              ? event.usage.totalTokens
              : null;
          finalizeSuccess(totalTokens);
        },
      });
      const headers = new Headers(
        createResolvedModelHeaders({
          resolved: currentModel,
          fallbackApplied,
        }),
      );
      headers.set(REQUEST_ID_HEADER, auditContext.requestId);
      quota.grant.headers.forEach((value, key) => headers.set(key, value));

      return result.toUIMessageStreamResponse({
        originalMessages: rawMessages as never[],
        headers,
        onError: () => "The assistant request could not be completed.",
      });
    } catch (error) {
      const classified = classifyRequestError(error, currentModel);
      lastError = classified;
      console.error("/api/chat error:", {
        provider: currentModel.provider,
        modelId: currentModel.modelId,
        code: classified.code,
        status: classified.status,
      });

      const hasFallbackCandidate = index < attemptChain.length - 1;
      const shouldRetry =
        currentModel.provider === "openrouter" &&
        hasFallbackCandidate &&
        (classified.code === "model_unavailable" || classified.code === "provider_rate_limited");

      if (shouldRetry) {
        continue;
      }

      quota.grant.release();
      logLlmAuditFailed(
        auditContext,
        currentModel,
        classified.code,
        fallbackApplied,
        Date.now() - auditContext.startedAt,
      );
      return createRequestErrorResponse({
        ...classified,
        headers: {
          [REQUEST_ID_HEADER]: auditContext.requestId,
          ...Object.fromEntries(quota.grant.headers.entries()),
        },
      });
    }
  }

  quota.grant.release();
  if (lastError) {
    logLlmAuditFailed(
      auditContext,
      primaryModel,
      lastError.code,
      primaryModel.modelId !== requestedModel.modelId || primaryModel.provider !== requestedModel.provider,
      Date.now() - auditContext.startedAt,
    );
  }
  return createRequestErrorResponse(
    lastError
      ? {
          ...lastError,
          headers: {
            [REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quota.grant.headers.entries()),
          },
        }
      : {
          code: "backend_unavailable",
          headers: {
            [REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quota.grant.headers.entries()),
          },
          message: "The assistant backend is unavailable right now. Try again in a moment.",
          status: 503,
        },
  );
}
