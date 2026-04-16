"use client";

import React from "react";
import { useSession } from "next-auth/react";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import type { SessionDocument, SessionSummary, SessionThreadExport } from "@/lib/session-documents";
import { normalizeSessionThreadExport } from "@/lib/session-documents";
import { hasPostAuthChatHandoff } from "@/lib/client/post-auth-handoff";

type PersistedSessionsContextValue = {
  activeSession: SessionDocument | null;
  activeSessionId: string | null;
  archiveSession: (sessionId: string) => Promise<void>;
  createSession: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteSessions: (sessionIds: string[]) => Promise<void>;
  isReady: boolean;
  renameSession: (sessionId: string, title: string | null) => Promise<void>;
  saveActiveSessionDocumentPatch: (patch: {
    artifacts?: SessionArtifact[];
    contextLinks?: SessionContextLink[];
    snapshot?: SessionThreadExport;
  }) => Promise<void>;
  saveActiveSessionSnapshot: (snapshot: SessionThreadExport) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  sessions: SessionSummary[];
};

type SessionsListResponse = {
  sessions: SessionSummary[];
};

type SessionResponse = {
  session: SessionDocument;
};

const SESSION_SNAPSHOT_CACHE_KEY_PREFIX = "nodes.session-snapshot-cache.v1:";

const pickSessionId = (
  sessions: SessionSummary[],
  options?: { excludeIds?: string[]; preferredId?: string | null },
) => {
  const excludeIds = new Set(options?.excludeIds ?? []);
  const available = sessions.filter((session) => !excludeIds.has(session.id));
  const preferredId = options?.preferredId ?? null;
  if (preferredId && available.some((session) => session.id === preferredId)) {
    return preferredId;
  }
  return available.find((session) => !session.archived)?.id ?? available[0]?.id ?? null;
};

const buildActiveSessionKey = (userId: string | null) =>
  userId ? `nodes.active-session-id.${userId}` : "nodes.active-session-id.v1";
const KEEPALIVE_SAFE_BODY_BYTES = 60 * 1024;

const PersistedSessionsContext = React.createContext<PersistedSessionsContextValue | null>(null);

const readStoredActiveSessionId = (userId: string | null) => {
  try {
    const urlSessionId = new URLSearchParams(window.location.search).get("sessionId");
    if (urlSessionId && urlSessionId.length > 0) {
      return urlSessionId;
    }
    return localStorage.getItem(buildActiveSessionKey(userId));
  } catch {
    return null;
  }
};

const writeStoredActiveSessionId = (userId: string | null, sessionId: string | null) => {
  try {
    const storageKey = buildActiveSessionKey(userId);
    if (!sessionId) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, sessionId);
  } catch {
    // ignore storage errors
  }
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export function PersistedSessionsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = React.useState<SessionDocument | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  const loadSession = React.useCallback(async (sessionId: string) => {
    const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`);
    let sessionDoc = data.session;

    // If the server snapshot is behind (for example, user closed the tab before PATCH completed),
    // prefer the locally cached snapshot and sync it back in the background.
    try {
      const cachedRaw = localStorage.getItem(`${SESSION_SNAPSHOT_CACHE_KEY_PREFIX}${sessionId}`);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as { snapshot?: unknown; savedAt?: unknown };
        const normalizedCachedSnapshot = normalizeSessionThreadExport(parsed?.snapshot);
        if (normalizedCachedSnapshot.messages.length > (sessionDoc.snapshot?.messages?.length ?? 0)) {
          sessionDoc = { ...sessionDoc, snapshot: normalizedCachedSnapshot };
          // Best-effort sync; ignore failures since this is just a recovery path.
          const body = JSON.stringify({ snapshot: normalizedCachedSnapshot });
          const bodyBytes = new TextEncoder().encode(body).length;
          void fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: bodyBytes <= KEEPALIVE_SAFE_BODY_BYTES,
          }).catch(() => {});
        }
      }
    } catch {
      // ignore cache errors
    }

    setActiveSession(sessionDoc);
    writeStoredActiveSessionId(userId, sessionDoc.id);
    return sessionDoc;
  }, [userId]);

  const refreshSessions = React.useCallback(async () => {
    const data = await fetchJson<SessionsListResponse>("/api/sessions?includeArchived=1");
    setSessions(data.sessions);
    return data.sessions;
  }, []);

  const bootstrap = React.useCallback(async () => {
    if (status === "loading") {
      return;
    }
    if (!userId) {
      setSessions([]);
      setActiveSession(null);
      setIsReady(true);
      return;
    }
    setIsReady(false);
    try {
      const shouldStartFresh = hasPostAuthChatHandoff();
      let nextSessions = await refreshSessions();

      if (shouldStartFresh || nextSessions.length === 0) {
        const created = await fetchJson<SessionResponse>("/api/sessions", {
          method: "POST",
          body: JSON.stringify({}),
        });
        nextSessions = [created.session, ...nextSessions.filter((session) => session.id !== created.session.id)];
        setSessions(nextSessions);
        setActiveSession(created.session);
        writeStoredActiveSessionId(userId, created.session.id);
        return;
      }

      setSessions(nextSessions);
      const preferredId = pickSessionId(nextSessions, {
        preferredId: readStoredActiveSessionId(userId),
      });

      if (preferredId) {
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
      } else {
        setActiveSession(null);
        writeStoredActiveSessionId(userId, null);
      }
    } finally {
      setIsReady(true);
    }
  }, [loadSession, refreshSessions, status, userId]);

  React.useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const selectSession = React.useCallback(async (sessionId: string) => {
    setIsReady(false);
    await loadSession(sessionId);
    setIsReady(true);
  }, [loadSession]);

  const createSession = React.useCallback(async () => {
    setIsReady(false);
    const data = await fetchJson<SessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setSessions((prev) => [data.session, ...prev]);
    setActiveSession(data.session);
    writeStoredActiveSessionId(userId, data.session.id);
    setIsReady(true);
  }, [userId]);

  const archiveSession = React.useCallback(async (sessionId: string) => {
    const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    const remaining = await refreshSessions();
    if (activeSession?.id !== sessionId) {
      return;
    }
    const nextSessionId = pickSessionId(remaining, { excludeIds: [sessionId] });
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
  }, [activeSession?.id, createSession, loadSession, refreshSessions]);

  const deleteSessions = React.useCallback(async (sessionIds: string[]) => {
    const uniqueSessionIds = [...new Set(sessionIds)].filter((sessionId) => sessionId.length > 0);
    if (uniqueSessionIds.length === 0) return;

    const response = await fetch("/api/sessions", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionIds: uniqueSessionIds }),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const remaining = await refreshSessions();

    if (!activeSession?.id || !uniqueSessionIds.includes(activeSession.id)) {
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
  }, [activeSession?.id, createSession, loadSession, refreshSessions, userId]);

  const deleteSession = React.useCallback(async (sessionId: string) => {
    await deleteSessions([sessionId]);
  }, [deleteSessions]);

  const recoverMissingSession = React.useCallback(async (sessionId: string) => {
    let remaining: SessionSummary[] = [];
    try {
      remaining = await refreshSessions();
    } catch {
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    }

    const visibleSessions = remaining.filter((session) => session.id !== sessionId);
    if (remaining.length > 0) {
      setSessions(visibleSessions);
    }

    if (activeSession?.id !== sessionId) {
      return;
    }

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
  }, [activeSession?.id, createSession, loadSession, refreshSessions, userId]);

  const renameSession = React.useCallback(async (sessionId: string, title: string | null) => {
    try {
      const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? data.session : session)),
      );
      setActiveSession((prev) => (prev?.id === sessionId ? data.session : prev));
    } catch (error) {
      if ((error as { status?: number })?.status === 404) {
        await recoverMissingSession(sessionId);
        return;
      }
      throw error;
    }
  }, [recoverMissingSession]);

  const saveActiveSessionDocumentPatch = React.useCallback(async (patch: {
    artifacts?: SessionArtifact[];
    contextLinks?: SessionContextLink[];
    snapshot?: SessionThreadExport;
  }) => {
    if (!activeSession) return;
    try {
      const body = JSON.stringify(patch);
      const bodyBytes = new TextEncoder().encode(body).length;
      const data = await fetchJson<SessionResponse>(`/api/sessions/${activeSession.id}`, {
        method: "PATCH",
        body,
        keepalive: bodyBytes <= KEEPALIVE_SAFE_BODY_BYTES,
      });
      setActiveSession(data.session);
      setSessions((prev) =>
        prev.map((session) => (session.id === data.session.id ? data.session : session)),
      );
    } catch (error) {
      if ((error as { status?: number })?.status === 404) {
        return;
      }
      throw error;
    }
  }, [activeSession]);

  const saveActiveSessionSnapshot = React.useCallback(async (snapshot: SessionThreadExport) => {
    await saveActiveSessionDocumentPatch({ snapshot });
  }, [saveActiveSessionDocumentPatch]);

  const value = React.useMemo<PersistedSessionsContextValue>(() => ({
    activeSession,
    activeSessionId: activeSession?.id ?? null,
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    renameSession,
    saveActiveSessionDocumentPatch,
    saveActiveSessionSnapshot,
    selectSession,
    sessions,
  }), [
    activeSession,
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    renameSession,
    saveActiveSessionDocumentPatch,
    saveActiveSessionSnapshot,
    selectSession,
    sessions,
  ]);

  return (
    <PersistedSessionsContext.Provider value={value}>
      {children}
    </PersistedSessionsContext.Provider>
  );
}

export function usePersistedSessions() {
  const context = React.useContext(PersistedSessionsContext);
  if (!context) {
    throw new Error("usePersistedSessions must be used within PersistedSessionsProvider");
  }
  return context;
}
