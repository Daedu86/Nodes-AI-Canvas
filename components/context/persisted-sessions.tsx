"use client";

import React from "react";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import type { SessionDocument, SessionSummary, SessionThreadExport } from "@/lib/session-documents";

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

const ACTIVE_SESSION_KEY = "assistant-ui.active-session-id.v1";
const KEEPALIVE_SAFE_BODY_BYTES = 60 * 1024;

const PersistedSessionsContext = React.createContext<PersistedSessionsContextValue | null>(null);

const readStoredActiveSessionId = () => {
  try {
    const urlSessionId = new URLSearchParams(window.location.search).get("sessionId");
    if (urlSessionId && urlSessionId.length > 0) {
      return urlSessionId;
    }
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
};

const writeStoredActiveSessionId = (sessionId: string | null) => {
  try {
    if (!sessionId) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
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
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = React.useState<SessionDocument | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  const loadSession = React.useCallback(async (sessionId: string) => {
    const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`);
    setActiveSession(data.session);
    writeStoredActiveSessionId(data.session.id);
    return data.session;
  }, []);

  const refreshSessions = React.useCallback(async () => {
    const data = await fetchJson<SessionsListResponse>("/api/sessions?includeArchived=1");
    setSessions(data.sessions);
    return data.sessions;
  }, []);

  const bootstrap = React.useCallback(async () => {
    setIsReady(false);
    let nextSessions = await refreshSessions();

    if (nextSessions.length === 0) {
      const created = await fetchJson<SessionResponse>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({}),
      });
      nextSessions = [created.session];
      setSessions(nextSessions);
      setActiveSession(created.session);
      writeStoredActiveSessionId(created.session.id);
      setIsReady(true);
      return;
    }

    setSessions(nextSessions);
    const preferredId = pickSessionId(nextSessions, {
      preferredId: readStoredActiveSessionId(),
    });

    if (preferredId) {
      await loadSession(preferredId);
    } else {
      setActiveSession(null);
      writeStoredActiveSessionId(null);
    }
    setIsReady(true);
  }, [loadSession, refreshSessions]);

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
    writeStoredActiveSessionId(data.session.id);
    setIsReady(true);
  }, []);

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
      preferredId: readStoredActiveSessionId(),
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

    writeStoredActiveSessionId(null);
    setActiveSession(null);
    await createSession();
  }, [activeSession?.id, createSession, loadSession, refreshSessions]);

  const deleteSession = React.useCallback(async (sessionId: string) => {
    await deleteSessions([sessionId]);
  }, [deleteSessions]);

  const renameSession = React.useCallback(async (sessionId: string, title: string | null) => {
    const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    setSessions((prev) =>
      prev.map((session) => (session.id === sessionId ? data.session : session)),
    );
    setActiveSession((prev) => (prev?.id === sessionId ? data.session : prev));
  }, []);

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
