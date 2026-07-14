import type { SessionSummary } from "@/lib/session-documents";
import { pickSessionId } from "@/lib/client/session-persistence";

export type SessionLifecycleDecision =
  | { type: "clear" }
  | { type: "create" }
  | { type: "keep" }
  | { sessionId: string; type: "load" };

type SessionRemovalDecisionOptions = {
  activeSessionId: string | null | undefined;
  preferredId?: string | null;
  remainingSessions: SessionSummary[];
  removedSessionIds: string[];
};

type MissingSessionDecisionOptions = {
  activeSessionId: string | null | undefined;
  missingSessionId: string;
  preferredId?: string | null;
  visibleSessions: SessionSummary[];
};

const loadOr = (sessionId: string | null, fallback: "clear" | "create"):
  SessionLifecycleDecision =>
  sessionId ? { sessionId, type: "load" } : { type: fallback };

export function decideSessionBootstrap(
  sessions: SessionSummary[],
  preferredId?: string | null,
): SessionLifecycleDecision {
  if (sessions.length === 0) return { type: "create" };
  return loadOr(pickSessionId(sessions, { preferredId }), "clear");
}

export function decideSessionLoadFailure(
  sessions: SessionSummary[],
  failedSessionId: string,
): SessionLifecycleDecision {
  return loadOr(
    pickSessionId(sessions, { excludeIds: [failedSessionId] }),
    "clear",
  );
}

export function decideAfterSessionRemoval({
  activeSessionId,
  preferredId,
  remainingSessions,
  removedSessionIds,
}: SessionRemovalDecisionOptions): SessionLifecycleDecision {
  if (!activeSessionId || !removedSessionIds.includes(activeSessionId)) {
    return { type: "keep" };
  }
  return loadOr(
    pickSessionId(remainingSessions, {
      excludeIds: removedSessionIds,
      preferredId,
    }),
    "create",
  );
}

export function decideMissingSessionRecovery({
  activeSessionId,
  missingSessionId,
  preferredId,
  visibleSessions,
}: MissingSessionDecisionOptions): SessionLifecycleDecision {
  if (activeSessionId !== missingSessionId) return { type: "keep" };
  return loadOr(
    pickSessionId(visibleSessions, { preferredId }),
    "create",
  );
}
