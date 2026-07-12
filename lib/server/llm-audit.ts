import type { ResolvedModelConfig } from "@/lib/llm/config";
import type { LlmStreamTimingSnapshot } from "@/lib/server/chat/stream-metrics";
import type { UserPlan } from "@/lib/user-plan";

export type LlmQuotaMetrics = {
  active: number;
  concurrentLimit: number;
  plan: UserPlan;
  remainingDay: number;
  remainingHour: number;
  remainingMinute: number;
  reservationMs: number;
  retryAfterSeconds: number | null;
};

export type LlmUsageMetrics = {
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  textTokens: number | null;
  totalTokens: number | null;
};

export type LlmAuditContext = {
  actorType: "agent" | "user";
  contextArtifactCount: number;
  historyMode: string | null;
  messageCount: number;
  requested: ResolvedModelConfig;
  requestId: string;
  route: string;
  sentMessageCount: number;
  startedAt: number;
  toolCount: number;
};

type LlmAuditMetrics = Partial<LlmStreamTimingSnapshot> & {
  attemptCount?: number;
  attemptDurationMs?: number;
};

type LlmAuditStatus =
  | "accepted"
  | "attempting"
  | "cancelled"
  | "completed"
  | "failed"
  | "fallback"
  | "rejected"
  | "streaming";

type LlmAuditEventName =
  | "attempt_started"
  | "fallback_applied"
  | "first_token"
  | "request_accepted"
  | "request_cancelled"
  | "request_completed"
  | "request_failed"
  | "request_rejected";

type LlmAuditEvent = {
  actorType: LlmAuditContext["actorType"];
  cancellationSource?: "client" | "runtime";
  contextArtifactCount: number;
  errorCode?: string;
  event: LlmAuditEventName;
  fallbackApplied?: boolean;
  fallbackFrom?: ResolvedModelConfig;
  fallbackTo?: ResolvedModelConfig;
  finishReason?: string | null;
  historyMode: string | null;
  messageCount: number;
  metrics?: LlmAuditMetrics;
  quota?: LlmQuotaMetrics;
  requestId: string;
  requested: ResolvedModelConfig;
  resolved?: ResolvedModelConfig;
  route: string;
  schemaVersion: 1;
  sentMessageCount: number;
  source: "nodes-llm-observability";
  status: LlmAuditStatus;
  timestamp: string;
  toolCount: number;
  usage?: LlmUsageMetrics;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sanitizeString = (value: string, maxLength = 256) => {
  let sanitized = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code >= 32 && code !== 127) sanitized += character;
    if (sanitized.length >= maxLength) break;
  }
  return sanitized;
};

const sanitizeModel = (
  model: ResolvedModelConfig,
): ResolvedModelConfig => ({
  modelId: sanitizeString(model.modelId),
  provider: model.provider,
});

const sanitizeMetrics = (
  metrics: LlmAuditMetrics | undefined,
): LlmAuditMetrics | undefined => {
  if (!metrics) return undefined;
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [
      key,
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.round(value))
        : value ?? null,
    ]),
  ) as LlmAuditMetrics;
};

const createBaseEvent = (
  context: LlmAuditContext,
  event: LlmAuditEventName,
  status: LlmAuditStatus,
): LlmAuditEvent => ({
  actorType: context.actorType,
  contextArtifactCount: context.contextArtifactCount,
  event,
  historyMode: context.historyMode,
  messageCount: context.messageCount,
  requestId: context.requestId,
  requested: sanitizeModel(context.requested),
  route: sanitizeString(context.route, 128),
  schemaVersion: 1,
  sentMessageCount: context.sentMessageCount,
  source: "nodes-llm-observability",
  status,
  timestamp: new Date().toISOString(),
  toolCount: context.toolCount,
});

const emitAudit = (event: LlmAuditEvent) => {
  if (process.env.NODES_LLM_OBSERVABILITY === "0") return;
  console.info(JSON.stringify(event));
};

export function createLlmAuditContext(options: {
  actorType?: LlmAuditContext["actorType"];
  contextArtifactCount?: number;
  historyMode?: string | null;
  messageCount?: number;
  requested: ResolvedModelConfig;
  route: string;
  sentMessageCount?: number;
  toolCount?: number;
}) {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    actorType: options.actorType ?? "user",
    contextArtifactCount: options.contextArtifactCount ?? 0,
    historyMode: options.historyMode ?? null,
    messageCount: options.messageCount ?? 0,
    requested: options.requested,
    requestId,
    route: options.route,
    sentMessageCount: options.sentMessageCount ?? 0,
    startedAt: Date.now(),
    toolCount: options.toolCount ?? 0,
  } satisfies LlmAuditContext;
}

export function getLlmUsageMetrics(event: unknown): LlmUsageMetrics {
  const eventRecord = asRecord(event);
  const usage =
    asRecord(eventRecord?.totalUsage) ?? asRecord(eventRecord?.usage);
  const inputDetails = asRecord(usage?.inputTokenDetails);
  const outputDetails = asRecord(usage?.outputTokenDetails);
  return {
    cacheReadTokens:
      getFiniteNumber(inputDetails?.cacheReadTokens) ??
      getFiniteNumber(usage?.cachedInputTokens),
    cacheWriteTokens: getFiniteNumber(inputDetails?.cacheWriteTokens),
    inputTokens: getFiniteNumber(usage?.inputTokens),
    outputTokens: getFiniteNumber(usage?.outputTokens),
    reasoningTokens:
      getFiniteNumber(outputDetails?.reasoningTokens) ??
      getFiniteNumber(usage?.reasoningTokens),
    textTokens: getFiniteNumber(outputDetails?.textTokens),
    totalTokens: getFiniteNumber(usage?.totalTokens),
  };
}

export function getLlmFinishReason(event: unknown) {
  const value = asRecord(event)?.finishReason;
  return typeof value === "string" ? sanitizeString(value, 64) : null;
}

export function getSafeErrorName(error: unknown) {
  const record = asRecord(error);
  const nested = asRecord(record?.error);
  const value =
    error instanceof Error
      ? error.name
      : typeof record?.name === "string"
        ? record.name
        : nested?.name;
  return typeof value === "string" && value.trim()
    ? sanitizeString(value.trim(), 96)
    : null;
}

export function logLlmAuditAccepted(
  context: LlmAuditContext,
  options?: { quota?: LlmQuotaMetrics },
) {
  emitAudit({
    ...createBaseEvent(context, "request_accepted", "accepted"),
    metrics: sanitizeMetrics({ durationMs: Date.now() - context.startedAt }),
    quota: options?.quota,
  });
}

export function logLlmAuditRejected(
  context: LlmAuditContext,
  options: {
    durationMs: number;
    errorCode: string;
    quota?: LlmQuotaMetrics;
  },
) {
  emitAudit({
    ...createBaseEvent(context, "request_rejected", "rejected"),
    errorCode: sanitizeString(options.errorCode, 96),
    metrics: sanitizeMetrics({ durationMs: options.durationMs }),
    quota: options.quota,
  });
}

export function logLlmAuditAttemptStarted(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options: { attemptNumber: number; fallbackApplied: boolean },
) {
  emitAudit({
    ...createBaseEvent(context, "attempt_started", "attempting"),
    fallbackApplied: options.fallbackApplied,
    metrics: sanitizeMetrics({ attemptCount: options.attemptNumber }),
    resolved: sanitizeModel(resolved),
  });
}

export function logLlmAuditFallback(
  context: LlmAuditContext,
  from: ResolvedModelConfig,
  to: ResolvedModelConfig,
  options: {
    attemptDurationMs: number;
    attemptNumber: number;
    errorCode: string;
  },
) {
  emitAudit({
    ...createBaseEvent(context, "fallback_applied", "fallback"),
    errorCode: sanitizeString(options.errorCode, 96),
    fallbackApplied: true,
    fallbackFrom: sanitizeModel(from),
    fallbackTo: sanitizeModel(to),
    metrics: sanitizeMetrics({
      attemptCount: options.attemptNumber,
      attemptDurationMs: options.attemptDurationMs,
    }),
    resolved: sanitizeModel(to),
  });
}

export function logLlmAuditFirstToken(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options: {
    attemptNumber: number;
    fallbackApplied: boolean;
    timing: LlmStreamTimingSnapshot;
  },
) {
  emitAudit({
    ...createBaseEvent(context, "first_token", "streaming"),
    fallbackApplied: options.fallbackApplied,
    metrics: sanitizeMetrics({
      ...options.timing,
      attemptCount: options.attemptNumber,
    }),
    resolved: sanitizeModel(resolved),
  });
}

export function logLlmAuditFailed(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options: {
    attemptCount: number;
    errorCode: string;
    fallbackApplied: boolean;
    timing: LlmStreamTimingSnapshot;
  },
) {
  emitAudit({
    ...createBaseEvent(context, "request_failed", "failed"),
    errorCode: sanitizeString(options.errorCode, 96),
    fallbackApplied: options.fallbackApplied,
    metrics: sanitizeMetrics({
      ...options.timing,
      attemptCount: options.attemptCount,
    }),
    resolved: sanitizeModel(resolved),
  });
}

export function logLlmAuditCancelled(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options: {
    attemptCount: number;
    cancellationSource: "client" | "runtime";
    fallbackApplied: boolean;
    timing: LlmStreamTimingSnapshot;
  },
) {
  emitAudit({
    ...createBaseEvent(context, "request_cancelled", "cancelled"),
    cancellationSource: options.cancellationSource,
    fallbackApplied: options.fallbackApplied,
    metrics: sanitizeMetrics({
      ...options.timing,
      attemptCount: options.attemptCount,
    }),
    resolved: sanitizeModel(resolved),
  });
}

export function logLlmAuditCompleted(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options: {
    attemptCount?: number;
    fallbackApplied?: boolean;
    finishReason?: string | null;
    timing?: LlmStreamTimingSnapshot;
    usage?: LlmUsageMetrics;
  } = {},
) {
  const durationMs = Date.now() - context.startedAt;
  const defaultTiming: LlmStreamTimingSnapshot = {
    durationMs,
    providerDurationMs: durationMs,
    providerTimeToFirstChunkMs: null,
    providerTimeToFirstTokenMs: null,
    timeToFirstChunkMs: null,
    timeToFirstTokenMs: null,
  };
  emitAudit({
    ...createBaseEvent(context, "request_completed", "completed"),
    fallbackApplied: options.fallbackApplied ?? false,
    finishReason: options.finishReason ?? null,
    metrics: sanitizeMetrics({
      ...(options.timing ?? defaultTiming),
      attemptCount: options.attemptCount ?? 1,
    }),
    resolved: sanitizeModel(resolved),
    usage: options.usage,
  });
}
