"use strict";

import { generateText, type ModelMessage } from "ai";
import {
  getModelAttemptChain,
  getRequestedModelConfig,
  resolveModelConfig,
  type Provider,
} from "@/lib/llm/config";
import { buildContextArtifactsUserMessage } from "@/lib/llm/context-builder";
import { isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import {
  classifyRequestError,
  createRequestErrorResponse,
  createResolvedModelHeaders,
} from "@/lib/llm/request-errors";
import {
  createLanguageModel,
  getMissingProviderCredential,
  getUserModelOverrides,
} from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import type { LlmStreamTimingSnapshot } from "@/lib/server/chat/stream-metrics";
import {
  createLlmAuditContext,
  getLlmUsageMetrics,
  logLlmAuditAccepted,
  logLlmAuditAttemptStarted,
  logLlmAuditCancelled,
  logLlmAuditCompleted,
  logLlmAuditFailed,
  logLlmAuditFallback,
  logLlmAuditRejected,
} from "@/lib/server/llm-audit";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import {
  getOutputFormatInstruction,
  normalizeLlmContextArtifacts,
  type SessionArtifactSemanticType,
} from "@/lib/session-artifacts";
import { getUserPlan } from "@/lib/user-plan-store";

export const runtime = "nodejs";
export const maxDuration = 60;

const REQUEST_ID_HEADER = "x-nodes-request-id";

type CanvasBranchRunRequestBody = {
  contextArtifacts?: unknown;
  contextScope?: unknown;
  model?: string;
  outputArtifactTypes?: unknown;
  prompt?: string;
  promptId?: string;
  provider?: Provider;
  runId?: string;
  system?: string;
};

const normalizeOutputTypes = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is SessionArtifactSemanticType =>
          entry === "decision" ||
          entry === "evidence" ||
          entry === "plan" ||
          entry === "table" ||
          entry === "question" ||
          entry === "draft",
      )
    : [];

const normalizeContextScope = (value: unknown) =>
  value === "parent" || value === "branch" || value === "tree"
    ? value
    : "branch";

const createAttemptTiming = (
  requestStartedAt: number,
  attemptStartedAt: number,
): LlmStreamTimingSnapshot => {
  const completedAt = Date.now();
  return {
    durationMs: Math.max(0, completedAt - requestStartedAt),
    providerDurationMs: Math.max(0, completedAt - attemptStartedAt),
    providerTimeToFirstChunkMs: null,
    providerTimeToFirstTokenMs: null,
    timeToFirstChunkMs: null,
    timeToFirstTokenMs: null,
  };
};

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  let body: CanvasBranchRunRequestBody;
  try {
    body = (await req.json()) as CanvasBranchRunRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json(
      { error: "A Canvas branch prompt is required." },
      { status: 400 },
    );
  }

  const contextArtifacts = normalizeLlmContextArtifacts(body.contextArtifacts);
  const outputArtifactTypes = normalizeOutputTypes(body.outputArtifactTypes);
  const formattingInstruction = getOutputFormatInstruction(outputArtifactTypes);
  const promptText = `${prompt}${formattingInstruction}`;
  const contextScope = normalizeContextScope(body.contextScope);
  const requestOverrides = await getUserModelOverrides(guarded.user.id);
  const userPlan = await getUserPlan(guarded.user.id);
  const requestedModel = getRequestedModelConfig(body);
  const primaryModel = resolveModelConfig(body);
  const attempts = getModelAttemptChain(primaryModel);
  const auditContext = createLlmAuditContext({
    actorType: guarded.user.isAgent ? "agent" : "user",
    contextArtifactCount: contextArtifacts.length,
    historyMode: `canvas-${contextScope}`,
    messageCount: 1,
    requested: requestedModel,
    route: "/api/canvas-branch-runs",
    sentMessageCount: 1 + (contextArtifacts.length > 0 ? 1 : 0),
    toolCount: 0,
  });

  const quota = await reserveChatQuota(guarded.user.id, userPlan);
  if (!quota.ok) {
    logLlmAuditRejected(auditContext, {
      durationMs: Date.now() - auditContext.startedAt,
      errorCode: quota.rejection.code,
      quota: quota.rejection.metrics,
    });
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

  logLlmAuditAccepted(auditContext, { quota: quota.grant.metrics });

  if (isE2eMockLlmEnabled()) {
    const resolved = attempts[0] ?? primaryModel;
    await quota.grant.release();
    logLlmAuditCompleted(auditContext, resolved, {
      attemptCount: 1,
      finishReason: "mock",
      timing: createAttemptTiming(
        auditContext.startedAt,
        auditContext.startedAt,
      ),
    });
    const headers = new Headers(
      createResolvedModelHeaders({ resolved, fallbackApplied: false }),
    );
    headers.set(REQUEST_ID_HEADER, auditContext.requestId);
    quota.grant.headers.forEach((value, key) => headers.set(key, value));
    return Response.json(
      {
        modelId: resolved.modelId,
        promptId: body.promptId ?? null,
        provider: resolved.provider,
        runId: body.runId ?? null,
        text: `Mock Canvas branch response: ${prompt}`,
      },
      { headers },
    );
  }

  let lastError: ReturnType<typeof classifyRequestError> | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const currentModel = attempts[index]!;
    const attemptNumber = index + 1;
    const attemptStartedAt = Date.now();
    const fallbackApplied =
      index > 0 ||
      currentModel.modelId !== requestedModel.modelId ||
      currentModel.provider !== requestedModel.provider;

    logLlmAuditAttemptStarted(auditContext, currentModel, {
      attemptNumber,
      fallbackApplied,
    });

    const missingCredential = getMissingProviderCredential(
      currentModel.provider,
      requestOverrides,
      { userPlan },
    );
    if (missingCredential) {
      await quota.grant.release();
      logLlmAuditFailed(auditContext, currentModel, {
        attemptCount: attemptNumber,
        errorCode: missingCredential.code,
        fallbackApplied,
        timing: createAttemptTiming(auditContext.startedAt, attemptStartedAt),
      });
      return createRequestErrorResponse({
        code: missingCredential.code,
        headers: { [REQUEST_ID_HEADER]: auditContext.requestId },
        message: missingCredential.message,
        status: missingCredential.status,
      });
    }

    try {
      const model = createLanguageModel(currentModel, requestOverrides, {
        userPlan,
      }) as Parameters<typeof generateText>[0]["model"];
      const artifactContextMessage = buildContextArtifactsUserMessage(
        contextArtifacts,
        {
          modelId: currentModel.modelId,
          provider: currentModel.provider,
        },
      );
      const messages: ModelMessage[] = [
        ...(artifactContextMessage
          ? [artifactContextMessage satisfies ModelMessage]
          : []),
        { role: "user", content: promptText },
      ];
      const result = await generateText({
        abortSignal: req.signal,
        experimental_telemetry: {
          functionId: "nodes.canvas-branch-run",
          isEnabled: process.env.NODES_LLM_OBSERVABILITY !== "0",
          recordInputs: false,
          recordOutputs: false,
        },
        messages,
        model,
        system: typeof body.system === "string" ? body.system : undefined,
        timeout: currentModel.provider === "openrouter" ? 45_000 : 30_000,
      });

      await quota.grant.release();
      logLlmAuditCompleted(auditContext, currentModel, {
        attemptCount: attemptNumber,
        fallbackApplied,
        finishReason: result.finishReason,
        timing: createAttemptTiming(auditContext.startedAt, attemptStartedAt),
        usage: getLlmUsageMetrics({ totalUsage: result.usage }),
      });
      const headers = new Headers(
        createResolvedModelHeaders({
          resolved: currentModel,
          fallbackApplied,
        }),
      );
      headers.set(REQUEST_ID_HEADER, auditContext.requestId);
      quota.grant.headers.forEach((value, key) => headers.set(key, value));
      return Response.json(
        {
          modelId: currentModel.modelId,
          promptId: body.promptId ?? null,
          provider: currentModel.provider,
          runId: body.runId ?? null,
          text: result.text,
        },
        { headers },
      );
    } catch (error) {
      const classified = classifyRequestError(error, currentModel);
      lastError = classified;
      if (req.signal.aborted) {
        await quota.grant.release();
        logLlmAuditCancelled(auditContext, currentModel, {
          attemptCount: attemptNumber,
          cancellationSource: "client",
          fallbackApplied,
          timing: createAttemptTiming(auditContext.startedAt, attemptStartedAt),
        });
        return createRequestErrorResponse({
          ...classified,
          headers: {
            [REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quota.grant.headers.entries()),
          },
        });
      }

      const hasFallback = index < attempts.length - 1;
      const shouldRetry =
        currentModel.provider === "openrouter" &&
        hasFallback &&
        (classified.code === "model_unavailable" ||
          classified.code === "provider_rate_limited" ||
          classified.code === "provider_unavailable");
      if (shouldRetry) {
        logLlmAuditFallback(
          auditContext,
          currentModel,
          attempts[index + 1]!,
          {
            attemptDurationMs: Date.now() - attemptStartedAt,
            attemptNumber,
            errorCode: classified.code,
          },
        );
        continue;
      }
      break;
    }
  }

  await quota.grant.release();
  const failure =
    lastError ??
    ({
      code: "backend_unavailable",
      message: "No configured model is currently available for this Canvas branch.",
      status: 503,
    } as const);
  logLlmAuditFailed(auditContext, primaryModel, {
    attemptCount: attempts.length,
    errorCode: failure.code,
    fallbackApplied:
      primaryModel.modelId !== requestedModel.modelId ||
      primaryModel.provider !== requestedModel.provider,
    timing: createAttemptTiming(
      auditContext.startedAt,
      auditContext.startedAt,
    ),
  });
  return createRequestErrorResponse({
    ...failure,
    headers: {
      [REQUEST_ID_HEADER]: auditContext.requestId,
      ...Object.fromEntries(quota.grant.headers.entries()),
    },
  });
}
