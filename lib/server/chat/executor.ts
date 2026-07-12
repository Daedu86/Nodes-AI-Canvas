import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { type ModelMessage, streamText } from "ai";
import {
  getModelAttemptChain,
  resolveModelConfig,
  type ResolvedModelConfig,
} from "@/lib/llm/config";
import { buildContextArtifactsUserMessage } from "@/lib/llm/context-builder";
import {
  createE2eMockChatResponse,
  isE2eMockLlmEnabled,
} from "@/lib/llm/e2e-mock";
import {
  classifyRequestError,
  createRequestErrorResponse,
  createResolvedModelHeaders,
} from "@/lib/llm/request-errors";
import {
  createLanguageModel,
  getMissingProviderCredential,
} from "@/lib/llm/provider-runtime";
import type { LlmRequestOverrides } from "@/lib/llm/request-overrides";
import {
  logLlmAuditCompleted,
  logLlmAuditFailed,
} from "@/lib/server/llm-audit";
import {
  CHAT_REQUEST_ID_HEADER,
  type PreparedChatRequest,
} from "@/lib/server/chat/request";
import type { UserPlan } from "@/lib/user-plan";

export type ChatQuotaGrant = {
  headers: Headers;
  release: () => Promise<void>;
};

type ChatAuditContext = Parameters<typeof logLlmAuditCompleted>[0];

type ExecuteChatRequestOptions = {
  auditContext: ChatAuditContext;
  quotaGrant: ChatQuotaGrant;
  request: PreparedChatRequest;
  requestOverrides: LlmRequestOverrides;
  userPlan: UserPlan;
};

const getTotalTokens = (event: unknown) =>
  event &&
  typeof event === "object" &&
  "usage" in event &&
  event.usage &&
  typeof event.usage === "object" &&
  "totalTokens" in event.usage &&
  typeof event.usage.totalTokens === "number"
    ? event.usage.totalTokens
    : null;

const isFallbackApplied = (
  currentModel: ResolvedModelConfig,
  requestedModel: ResolvedModelConfig,
  attemptIndex: number,
) =>
  attemptIndex > 0 ||
  currentModel.modelId !== requestedModel.modelId ||
  currentModel.provider !== requestedModel.provider;

const createModelMessages = (
  request: PreparedChatRequest,
  currentModel: ResolvedModelConfig,
): ModelMessage[] => {
  const artifactContextMessage = buildContextArtifactsUserMessage(
    request.contextArtifacts,
    {
      modelId: currentModel.modelId,
      provider: currentModel.provider,
    },
  );
  const modelMessages = request.messagesToSend.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.modelContent as string,
      } satisfies ModelMessage;
    }
    if (message.role === "system") {
      return {
        role: "system",
        content: message.modelContent as string,
      } satisfies ModelMessage;
    }
    return {
      role: "user",
      content: message.modelContent,
    } satisfies ModelMessage;
  });

  return artifactContextMessage
    ? [artifactContextMessage satisfies ModelMessage, ...modelMessages]
    : modelMessages;
};

const createMockResponse = async ({
  auditContext,
  quotaGrant,
  request,
}: Pick<ExecuteChatRequestOptions, "auditContext" | "quotaGrant" | "request">) => {
  const resolved = resolveModelConfig(request.body);
  const response = createE2eMockChatResponse(request.messagesToSend, {
    contextArtifacts: request.contextArtifacts,
    historyMode: request.historyMode,
    modelId: resolved.modelId,
    provider: resolved.provider,
  });
  await quotaGrant.release();
  logLlmAuditCompleted(auditContext, resolved);

  const headers = new Headers(response.headers);
  headers.set(CHAT_REQUEST_ID_HEADER, auditContext.requestId);
  quotaGrant.headers.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

export async function executeChatRequest(
  options: ExecuteChatRequestOptions,
): Promise<Response> {
  const {
    auditContext,
    quotaGrant,
    request,
    requestOverrides,
    userPlan,
  } = options;

  if (isE2eMockLlmEnabled()) {
    return createMockResponse({ auditContext, quotaGrant, request });
  }

  const primaryModel = resolveModelConfig(request.body);
  const attemptChain = getModelAttemptChain(primaryModel);
  const toolset = request.tools
    ? {
        ...frontendTools(
          request.tools as Parameters<typeof frontendTools>[0],
        ),
      }
    : undefined;
  let lastError: ReturnType<typeof classifyRequestError> | null = null;

  for (let index = 0; index < attemptChain.length; index += 1) {
    const currentModel = attemptChain[index]!;
    const fallbackApplied = isFallbackApplied(
      currentModel,
      request.requestedModel,
      index,
    );

    const missingCredential = getMissingProviderCredential(
      currentModel.provider,
      requestOverrides,
      { userPlan },
    );
    if (missingCredential) {
      console.error(`Missing provider credential for ${currentModel.provider}`);
      await quotaGrant.release();
      logLlmAuditFailed(
        auditContext,
        currentModel,
        missingCredential.code,
        fallbackApplied,
        Date.now() - auditContext.startedAt,
      );
      return createRequestErrorResponse({
        code: missingCredential.code,
        headers: { [CHAT_REQUEST_ID_HEADER]: auditContext.requestId },
        message: missingCredential.message,
        status: missingCredential.status,
      });
    }

    try {
      let finalized = false;
      const finalizeFailure = (errorCode: string) => {
        if (finalized) return;
        finalized = true;
        void quotaGrant.release();
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
        void quotaGrant.release();
        logLlmAuditCompleted(auditContext, currentModel, {
          fallbackApplied,
          totalTokens: totalTokens ?? null,
        });
      };

      const model = createLanguageModel(
        currentModel,
        requestOverrides,
        { userPlan },
      ) as Parameters<typeof streamText>[0]["model"];
      const result = streamText({
        model,
        messages: createModelMessages(request, currentModel),
        system: request.system,
        tools: toolset,
        timeout: currentModel.provider === "openrouter" ? 45_000 : 30_000,
        onError: (error) => {
          console.error(error);
          const classified = classifyRequestError(error, currentModel);
          finalizeFailure(classified.code);
        },
        onFinish: (event: unknown) => {
          finalizeSuccess(getTotalTokens(event));
        },
      });
      const headers = new Headers(
        createResolvedModelHeaders({
          resolved: currentModel,
          fallbackApplied,
        }),
      );
      headers.set(CHAT_REQUEST_ID_HEADER, auditContext.requestId);
      quotaGrant.headers.forEach((value, key) => headers.set(key, value));

      return result.toUIMessageStreamResponse({
        originalMessages: request.rawMessages as never[],
        headers,
        onError: (error) =>
          classifyRequestError(error, currentModel).message,
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
        (classified.code === "model_unavailable" ||
          classified.code === "provider_rate_limited" ||
          classified.code === "provider_unavailable");

      if (shouldRetry) {
        continue;
      }

      await quotaGrant.release();
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
          [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
          ...Object.fromEntries(quotaGrant.headers.entries()),
        },
      });
    }
  }

  await quotaGrant.release();
  if (lastError) {
    logLlmAuditFailed(
      auditContext,
      primaryModel,
      lastError.code,
      primaryModel.modelId !== request.requestedModel.modelId ||
        primaryModel.provider !== request.requestedModel.provider,
      Date.now() - auditContext.startedAt,
    );
  }

  return createRequestErrorResponse(
    lastError
      ? {
          ...lastError,
          headers: {
            [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quotaGrant.headers.entries()),
          },
        }
      : {
          code: "backend_unavailable",
          headers: {
            [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quotaGrant.headers.entries()),
          },
          message:
            "The assistant backend is unavailable right now. Try again in a moment.",
          status: 503,
        },
  );
}
