import type { Provider, ResolvedModelConfig } from "@/lib/llm/config";
import type { AuthenticatedUser } from "@/lib/server/auth-user";

type LlmAuditStatus = "accepted" | "completed" | "failed" | "rejected";

type LlmAuditEvent = {
  contextArtifactCount?: number;
  durationMs?: number;
  errorCode?: string | null;
  fallbackApplied?: boolean;
  historyMode?: string | null;
  modelId: string;
  provider: Provider;
  requestId: string;
  resolvedModelId?: string;
  resolvedProvider?: Provider;
  route: string;
  status: LlmAuditStatus;
  totalTokens?: number | null;
  userId: string;
};

type LlmAuditContext = {
  contextArtifactCount: number;
  historyMode: string | null;
  requested: ResolvedModelConfig;
  requestId: string;
  route: string;
  startedAt: number;
  user: AuthenticatedUser;
};

export function createLlmAuditContext(options: {
  contextArtifactCount?: number;
  historyMode?: string | null;
  requested: ResolvedModelConfig;
  route: string;
  user: AuthenticatedUser;
}) {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    contextArtifactCount: options.contextArtifactCount ?? 0,
    historyMode: options.historyMode ?? null,
    requested: options.requested,
    requestId,
    route: options.route,
    startedAt: Date.now(),
    user: options.user,
  } satisfies LlmAuditContext;
}

function emitAudit(event: LlmAuditEvent) {
  console.info("[nodes-llm-audit]", JSON.stringify(event));
}

export function logLlmAuditAccepted(context: LlmAuditContext) {
  emitAudit({
    contextArtifactCount: context.contextArtifactCount,
    historyMode: context.historyMode,
    modelId: context.requested.modelId,
    provider: context.requested.provider,
    requestId: context.requestId,
    route: context.route,
    status: "accepted",
    userId: context.user.id,
  });
}

export function logLlmAuditRejected(
  context: LlmAuditContext,
  errorCode: string,
  durationMs: number,
) {
  emitAudit({
    contextArtifactCount: context.contextArtifactCount,
    durationMs,
    errorCode,
    historyMode: context.historyMode,
    modelId: context.requested.modelId,
    provider: context.requested.provider,
    requestId: context.requestId,
    route: context.route,
    status: "rejected",
    userId: context.user.id,
  });
}

export function logLlmAuditFailed(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  errorCode: string,
  fallbackApplied: boolean,
  durationMs: number,
) {
  emitAudit({
    contextArtifactCount: context.contextArtifactCount,
    durationMs,
    errorCode,
    fallbackApplied,
    historyMode: context.historyMode,
    modelId: context.requested.modelId,
    provider: context.requested.provider,
    requestId: context.requestId,
    resolvedModelId: resolved.modelId,
    resolvedProvider: resolved.provider,
    route: context.route,
    status: "failed",
    userId: context.user.id,
  });
}

export function logLlmAuditCompleted(
  context: LlmAuditContext,
  resolved: ResolvedModelConfig,
  options?: {
    fallbackApplied?: boolean;
    totalTokens?: number | null;
  },
) {
  emitAudit({
    contextArtifactCount: context.contextArtifactCount,
    durationMs: Date.now() - context.startedAt,
    fallbackApplied: options?.fallbackApplied ?? false,
    historyMode: context.historyMode,
    modelId: context.requested.modelId,
    provider: context.requested.provider,
    requestId: context.requestId,
    resolvedModelId: resolved.modelId,
    resolvedProvider: resolved.provider,
    route: context.route,
    status: "completed",
    totalTokens: options?.totalTokens ?? null,
    userId: context.user.id,
  });
}
