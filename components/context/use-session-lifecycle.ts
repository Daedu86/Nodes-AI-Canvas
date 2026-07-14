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
  pickSessionId,
  recoverSessionDocumentFromCache,
  type SessionDocumentPatch,
  type SessionResponse,
} from "@/lib/client/session-persistence";
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
      if (nextSessions.length === 0) {
        await createSession();
        return;
      }

      const preferredId = pickSessionId(nextSessions, {
        preferredId: readStoredActiveSessionId(userId),
      });
      if (!preferredId) {
        setActiveSession(null);
        writeStoredActiveSessionId(userId, null);
        return;
      }

      try {
        await loadSession(preferredId);
      } catch {
        const fallbackSessionId = pickSessionId(nextSessions, {
          excludeIds: [preferredId],
        });
        if (fallbackSessionId) {
          await loadSession(fallbackSessionId);
        } else {
          setActiveSession(null);
          writeStoredActiveSessionId(userId, null);
        }
      }
    } finally {
      setIsReady(true);
    }
  }, [
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
      if (activeSessionRef.current?.id !== sessionId) return;

      const nextSessionId = pickSessionId(remaining, {
        excludeIds: [sessionId],
      });
      if (nextSessionId) {
        setIsReady(false);
        try {
          await loadSession(nextSessionId);
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
      if (
        !isActiveSessionRemoved(
          activeSessionRef.current?.id,
          uniqueSessionIds,
        )
      ) {
        return;
      }

      const nextSessionId = pickSessionId(remaining, {
        excludeIds: uniqueSessionIds,
        preferredId: readStoredActiveSessionId(userId),
      });
      if (nextSessionId) {
        setIsReady(false);
        try {
          await loadSession(nextSessionId);
          setIsReady(true);
        } catch {
          await createSession();
        }
        return;
      }

      writeStoredActiveSessionId(userId, null);
      setActiveSession(null);
      await createSession();
    },
    [
      activeSessionRef,
      createSession,
      loadSession,
      refreshSessions,
      setActiveSession,
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
      if (activeSessionRef.current?.id !== sessionId) return;

      const nextSessionId = pickSessionId(visibleSessions, {
        preferredId: readStoredActiveSessionId(userId),
      });
      if (nextSessionId) {
        setIsReady(false);
        try {
          await loadSession(nextSessionId);
        } catch {
          writeStoredActiveSessionId(userId, null);
          setActiveSession(null);
          await createSession();
        } finally {
          setIsReady(true);
        }
        return;
      }

      writeStoredActiveSessionId(userId, null);
      setActiveSession(null);
      await createSession();
    },
    [
      activeSessionRef,
      createSession,
      loadSession,
      refreshSessions,
      sessionsRef,
      setActiveSession,
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
