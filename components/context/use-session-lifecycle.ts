"use client";

import React from "react";
import {
  dedupeResourceIds,
  fetchApi,
  fetchJson,
  readStoredResourceId,
  writeStoredResourceId,
} from "@/lib/client/persisted-resource-client";
import {
  patchSessionRequest,
  recoverSessionDocumentFromCache,
  type SessionDocumentPatch,
  type SessionResponse,
} from "@/lib/client/session-persistence";
import {
  decideAfterSessionRemoval,
  decideMissingSessionRecovery,
  decideSessionBootstrap,
  decideSessionLoadFailure,
} from "@/lib/client/session-orchestration";
import type { SessionDocument, SessionSummary } from "@/lib/session-documents";

type SessionStatus = "authenticated" | "loading" | "unauthenticated";

type UseSessionLifecycleOptions = {
  activeSessionRef: React.RefObject<SessionDocument | null>;
  getKnownSession: (sessionId: string) => SessionDocument | SessionSummary | null;
  prependSession: (session: SessionDocument) => void;
  registerSessionConflict: (
    sessionId: string,
    attemptedPatch: SessionDocumentPatch,
    error: unknown,
  ) => boolean;
  sessionsRef: React.RefObject<SessionSummary[]>;
  setActiveSession: (session: SessionDocument | null) => void;
  setSessions: (update: React.SetStateAction<SessionSummary[]>) => void;
  status: SessionStatus;
  updateKnownSession: (session: SessionDocument) => void;
  userId: string | null;
};

type SessionsListResponse = {
  sessions: SessionSummary[];
};

const readStoredActiveSessionId = (userId: string | null) =>
  readStoredResourceId("session", userId, { urlParam: "sessionId" });

const writeStoredActiveSessionId = (
  userId: string | null,
  sessionId: string | null,
) => writeStoredResourceId("session", userId, sessionId);

export const filterRemovedSessions = (
  sessions: SessionSummary[],
  removedSessionIds: string[],
) => {
  const removed = new Set(removedSessionIds);
  return sessions.filter((session) => !removed.has(session.id));
};

export const isActiveSessionRemoved = (
  activeSessionId: string | null | undefined,
  removedSessionIds: string[],
) => !!activeSessionId && removedSessionIds.includes(activeSessionId);

export function useSessionLifecycle({
  activeSessionRef,
  getKnownSession,
  prependSession,
  registerSessionConflict,
  sessionsRef,
  setActiveSession,
  setSessions,
  status,
  updateKnownSession,
  userId,
}: UseSessionLifecycleOptions) {
  const [isReady, setIsReady] = React.useState(false);

  const loadSession = React.useCallback(
    async (sessionId: string) => {
      const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`);
      const sessionDoc = await recoverSessionDocumentFromCache(
        data.session,
        registerSessionConflict,
      );

      setActiveSession(sessionDoc);
      writeStoredActiveSessionId(userId, sessionDoc.id);
      return sessionDoc;
    },
    [registerSessionConflict, setActiveSession, userId],
  );

  const refreshSessions = React.useCallback(async () => {
    const data = await fetchJson<SessionsListResponse>(
      "/api/sessions?includeArchived=1",
    );
    setSessions(data.sessions);
    return data.sessions;
  }, [setSessions]);

  const createSession = React.useCallback(async () => {
    setIsReady(false);
    const data = await fetchJson<SessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    prependSession(data.session);
    setActiveSession(data.session);
    writeStoredActiveSessionId(userId, data.session.id);
    setIsReady(true);
  }, [prependSession, setActiveSession, userId]);

  const clearActiveSession = React.useCallback(() => {
    writeStoredActiveSessionId(userId, null);
    setActiveSession(null);
  }, [setActiveSession, userId]);

  const bootstrap = React.useCallback(async () => {
    if (status === "loading") return;
    if (!userId) {
      setSessions([]);
      setActiveSession(null);
      setIsReady(true);
      return;
    }

    setIsReady(false);
    try {
      const nextSessions = await refreshSessions();
      const decision = decideSessionBootstrap(
        nextSessions,
        readStoredActiveSessionId(userId),
      );
      if (decision.type === "create") {
        await createSession();
        return;
      }
      if (decision.type === "clear") {
        clearActiveSession();
        return;
      }
      if (decision.type !== "load") return;

      try {
        await loadSession(decision.sessionId);
      } catch {
        const fallback = decideSessionLoadFailure(
          nextSessions,
          decision.sessionId,
        );
        if (fallback.type === "load") {
          await loadSession(fallback.sessionId);
        } else {
          clearActiveSession();
        }
      }
    } finally {
      setIsReady(true);
    }
  }, [
    clearActiveSession,
    createSession,
    loadSession,
    refreshSessions,
    setActiveSession,
    setSessions,
    status,
    userId,
  ]);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const selectSession = React.useCallback(
    async (sessionId: string) => {
      setIsReady(false);
      await loadSession(sessionId);
      setIsReady(true);
    },
    [loadSession],
  );

  const archiveSession = React.useCallback(
    async (sessionId: string) => {
      const knownSession = getKnownSession(sessionId);
      if (!knownSession) return;
      const attemptedPatch = { archived: true };
      let data: SessionResponse;
      try {
        data = await patchSessionRequest(
          sessionId,
          attemptedPatch,
          knownSession.version,
        );
      } catch (error) {
        if (registerSessionConflict(sessionId, attemptedPatch, error)) return;
        throw error;
      }
      updateKnownSession(data.session);
      const remaining = await refreshSessions();
      const decision = decideAfterSessionRemoval({
        activeSessionId: activeSessionRef.current?.id,
        remainingSessions: remaining,
        removedSessionIds: [sessionId],
      });
      if (decision.type === "keep") return;
      if (decision.type === "load") {
        setIsReady(false);
        try {
          await loadSession(decision.sessionId);
          setIsReady(true);
        } catch {
          await createSession();
        }
        return;
      }

      setActiveSession(data.session);
      await createSession();
    },
    [
      activeSessionRef,
      createSession,
      getKnownSession,
      loadSession,
      refreshSessions,
      registerSessionConflict,
      setActiveSession,
      updateKnownSession,
    ],
  );

  const deleteSessions = React.useCallback(
    async (sessionIds: string[]) => {
      const uniqueSessionIds = dedupeResourceIds(sessionIds);
      if (uniqueSessionIds.length === 0) return;

      await fetchApi(
        "/api/sessions",
        {
          method: "DELETE",
          body: JSON.stringify({ sessionIds: uniqueSessionIds }),
        },
        { allowedStatuses: [404] },
      );

      const remaining = await refreshSessions();
      const decision = decideAfterSessionRemoval({
        activeSessionId: activeSessionRef.current?.id,
        preferredId: readStoredActiveSessionId(userId),
        remainingSessions: remaining,
        removedSessionIds: uniqueSessionIds,
      });
      if (decision.type === "keep") return;
      if (decision.type === "load") {
        setIsReady(false);
        try {
          await loadSession(decision.sessionId);
          setIsReady(true);
        } catch {
          await createSession();
        }
        return;
      }

      clearActiveSession();
      await createSession();
    },
    [
      activeSessionRef,
      clearActiveSession,
      createSession,
      loadSession,
      refreshSessions,
      userId,
    ],
  );

  const deleteSession = React.useCallback(
    async (sessionId: string) => {
      await deleteSessions([sessionId]);
    },
    [deleteSessions],
  );

  const recoverMissingSession = React.useCallback(
    async (sessionId: string) => {
      let remaining: SessionSummary[] = [];
      try {
        remaining = await refreshSessions();
      } catch {
        remaining = filterRemovedSessions(sessionsRef.current, [sessionId]);
        setSessions(remaining);
      }

      const visibleSessions = filterRemovedSessions(remaining, [sessionId]);
      if (remaining.length > 0) setSessions(visibleSessions);
      const decision = decideMissingSessionRecovery({
        activeSessionId: activeSessionRef.current?.id,
        missingSessionId: sessionId,
        preferredId: readStoredActiveSessionId(userId),
        visibleSessions,
      });
      if (decision.type === "keep") return;
      if (decision.type === "load") {
        setIsReady(false);
        try {
          await loadSession(decision.sessionId);
        } catch {
          clearActiveSession();
          await createSession();
        } finally {
          setIsReady(true);
        }
        return;
      }

      clearActiveSession();
      await createSession();
    },
    [
      activeSessionRef,
      clearActiveSession,
      createSession,
      loadSession,
      refreshSessions,
      sessionsRef,
      setSessions,
      userId,
    ],
  );

  return {
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    recoverMissingSession,
    selectSession,
  };
}
