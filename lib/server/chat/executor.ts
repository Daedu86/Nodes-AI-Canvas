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
import type { ChatQuotaGrant } from "@/lib/server/chat-governor";
import {
  createLlmStreamTimingTracker,
  type LlmStreamTimingSnapshot,
} from "@/lib/server/chat/stream-metrics";
import {
  getLlmFinishReason,
  getLlmUsageMetrics,
  getSafeErrorName,
  logLlmAuditAttemptStarted,
  logLlmAuditCancelled,
  logLlmAuditCompleted,
  logLlmAuditFailed,
  logLlmAuditFallback,
  logLlmAuditFirstToken,
} from "@/lib/server/llm-audit";
import {
  CHAT_REQUEST_ID_HEADER,
  type PreparedChatRequest,
} from "@/lib/server/chat/request";
import type { UserPlan } from "@/lib/user-plan";

export type { ChatQuotaGrant } from "@/lib/server/chat-governor";

type ChatAuditContext = Parameters<typeof logLlmAuditCompleted>[0];

type ExecuteChatRequestOptions = {
  abortSignal?: AbortSignal;
  auditContext: ChatAuditContext;
  quotaGrant: ChatQuotaGrant;
  request: PreparedChatRequest;
  requestOverrides: LlmRequestOverrides;
  userPlan: UserPlan;
};

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

const createUnstartedTiming = (
  auditContext: ChatAuditContext,
): LlmStreamTimingSnapshot => {
  const durationMs = Date.now() - auditContext.startedAt;
  return {
    durationMs,
    providerDurationMs: durationMs,
    providerTimeToFirstChunkMs: null,
    providerTimeToFirstTokenMs: null,
    timeToFirstChunkMs: null,
    timeToFirstTokenMs: null,
  };
};

const sanitizeDiagnosticText = (value: string, maxLength = 500) =>
  [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}/g, "[redacted-token]")
    .slice(0, maxLength);

const parseDiagnosticJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const getSafeProviderErrorMessage = (
  error: unknown,
  seen = new Set<unknown>(),
): string | null => {
  if (error == null || seen.has(error)) return null;
  if (typeof error === "string") {
    const message = sanitizeDiagnosticText(error.trim());
    return message || null;
  }
  if (typeof error !== "object") return null;

  seen.add(error);
  const record = error as Record<string, unknown>;
  const candidates: unknown[] = [];

  if (error instanceof Error && error.message) candidates.push(error.message);
  for (const key of ["message", "responseBody", "body", "data", "error", "cause", "lastError"]) {
    if (record[key] != null) candidates.push(parseDiagnosticJson(record[key]));
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const message = sanitizeDiagnosticText(candidate.trim());
      if (message) return message;
      continue;
    }
    const nested = getSafeProviderErrorMessage(candidate, seen);
    if (nested) return nested;
  }
  return null;
};

const getSafeProviderErrorCode = (error: unknown): string | number | null => {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  const value = record.code ?? nested?.code;
  return typeof value === "string" || typeof value === "number"
    ? sanitizeDiagnosticText(String(value), 96)
    : null;
};

const logSafeAttemptError = (options: {
  auditContext: ChatAuditContext;
  error: unknown;
  errorCode: string;
  model: ResolvedModelConfig;
  status: number;
}) => {
  console.error(
    JSON.stringify({
      errorCode: options.errorCode,
      errorName: getSafeErrorName(options.error),
      event: "llm_attempt_error",
      modelId: options.model.modelId,
      provider: options.model.provider,
      providerErrorCode: getSafeProviderErrorCode(options.error),
      providerMessage: getSafeProviderErrorMessage(options.error),
      requestId: options.auditContext.requestId,
      source: "nodes-llm-observability",
      status: options.status,
    }),
  );
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
  logLlmAuditCompleted(auditContext, resolved, {
    attemptCount: 1,
    finishReason: "mock",
    timing: createUnstartedTiming(auditContext),
  });

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
  const abortSignal = options.abortSignal ?? new AbortController().signal;
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
    const attemptNumber = index + 1;
    const fallbackApplied = isFallbackApplied(
      currentModel,
      request.requestedModel,
      index,
    );
    const attemptStartedAt = Date.now();
    const timingTracker = createLlmStreamTimingTracker({
      attemptStartedAt,
      requestStartedAt: auditContext.startedAt,
    });
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
      await quotaGrant.release();
      logLlmAuditFailed(auditContext, currentModel, {
        attemptCount: attemptNumber,
        errorCode: missingCredential.code,
        fallbackApplied,
        timing: timingTracker.snapshot(),
      });
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
        logLlmAuditFailed(auditContext, currentModel, {
          attemptCount: attemptNumber,
          errorCode,
          fallbackApplied,
          timing: timingTracker.snapshot(),
        });
      };
      const finalizeCancellation = (
        cancellationSource: "client" | "runtime",
      ) => {
        if (finalized) return;
        finalized = true;
        void quotaGrant.release();
        logLlmAuditCancelled(auditContext, currentModel, {
          attemptCount: attemptNumber,
          cancellationSource,
          fallbackApplied,
          timing: timingTracker.snapshot(),
        });
      };
      const finalizeSuccess = (event: unknown) => {
        if (finalized) return;
        finalized = true;
        void quotaGrant.release();
        logLlmAuditCompleted(auditContext, currentModel, {
          attemptCount: attemptNumber,
          fallbackApplied,
          finishReason: getLlmFinishReason(event),
          timing: timingTracker.snapshot(),
          usage: getLlmUsageMetrics(event),
        });
      };

      const model = createLanguageModel(
        currentModel,
        requestOverrides,
        { userPlan },
      ) as Parameters<typeof streamText>[0]["model"];
      const result = streamText({
        abortSignal,
        experimental_telemetry: {
          functionId: "nodes.chat",
          isEnabled: process.env.NODES_LLM_OBSERVABILITY !== "0",
          recordInputs: false,
          recordOutputs: false,
        },
        model,
        messages: createModelMessages(request, currentModel),
        system: request.system,
        tools: toolset as Parameters<typeof streamText>[0]["tools"],
        timeout: currentModel.provider === "openrouter" ? 45_000 : 30_000,
        onChunk: (event: unknown) => {
          const observation = timingTracker.observe(event);
          if (observation.firstTokenObserved) {
            logLlmAuditFirstToken(auditContext, currentModel, {
              attemptNumber,
              fallbackApplied,
              timing: observation.snapshot,
            });
          }
        },
        onAbort: () => {
          finalizeCancellation(abortSignal.aborted ? "client" : "runtime");
        },
        onError: (error: unknown) => {
          const classified = classifyRequestError(error, currentModel);
          logSafeAttemptError({
            auditContext,
            error,
            errorCode: classified.code,
            model: currentModel,
            status: classified.status,
          });
          if (abortSignal.aborted) {
            finalizeCancellation("client");
          } else {
            finalizeFailure(classified.code);
          }
        },
        onFinish: (event: unknown) => {
          finalizeSuccess(event);
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
      logSafeAttemptError({
        auditContext,
        error,
        errorCode: classified.code,
        model: currentModel,
        status: classified.status,
      });

      if (abortSignal.aborted) {
        await quotaGrant.release();
        logLlmAuditCancelled(auditContext, currentModel, {
          attemptCount: attemptNumber,
          cancellationSource: "client",
          fallbackApplied,
          timing: timingTracker.snapshot(),
        });
        return createRequestErrorResponse({
          ...classified,
          headers: {
            [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
            ...Object.fromEntries(quotaGrant.headers.entries()),
          },
        });
      }

      const hasFallbackCandidate = index < attemptChain.length - 1;
      const shouldRetry =
        currentModel.provider === "openrouter" &&
        hasFallbackCandidate &&
        (classified.code === "model_unavailable" ||
          classified.code === "provider_rate_limited" ||
          classified.code === "provider_unavailable");

      if (shouldRetry) {
        logLlmAuditFallback(
          auditContext,
          currentModel,
          attemptChain[index + 1]!,
          {
            attemptDurationMs: Date.now() - attemptStartedAt,
            attemptNumber,
            errorCode: classified.code,
          },
        );
        continue;
      }

      await quotaGrant.release();
      logLlmAuditFailed(auditContext, currentModel, {
        attemptCount: attemptNumber,
        errorCode: classified.code,
        fallbackApplied,
        timing: timingTracker.snapshot(),
      });
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
    logLlmAuditFailed(auditContext, primaryModel, {
      attemptCount: attemptChain.length,
      errorCode: lastError.code,
      fallbackApplied:
        primaryModel.modelId !== request.requestedModel.modelId ||
        primaryModel.provider !== request.requestedModel.provider,
      timing: createUnstartedTiming(auditContext),
    });
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
