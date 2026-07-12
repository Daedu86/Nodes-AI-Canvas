"use client";

import React from "react";
import { useSession } from "next-auth/react";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import type { SessionDocument, SessionSummary, SessionThreadExport } from "@/lib/session-documents";
import { normalizeSessionThreadExport } from "@/lib/session-documents";
import { SESSION_VERSION_CONFLICT_CODE } from "@/lib/session-version-conflict";

type ActiveSessionDocumentPatch = {
  artifacts?: SessionArtifact[];
  contextLinks?: SessionContextLink[];
  snapshot?: SessionThreadExport;
};

type SessionDocumentPatch = ActiveSessionDocumentPatch & {
  archived?: boolean;
  title?: string | null;
};

type SessionConflictState = {
  attemptedPatch: SessionDocumentPatch;
  currentSession: SessionDocument;
  sessionId: string;
};

type PersistedSessionsContextValue = {
  activeSession: SessionDocument | null;
  activeSessionId: string | null;
  archiveSession: (sessionId: string) => Promise<void>;
  createSession: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteSessions: (sessionIds: string[]) => Promise<void>;
  isReady: boolean;
  renameSession: (sessionId: string, title: string | null) => Promise<void>;
  saveActiveSessionDocumentPatch: (patch: ActiveSessionDocumentPatch) => Promise<void>;
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

type SessionConflictResponse = SessionResponse & {
  code: typeof SESSION_VERSION_CONFLICT_CODE;
  error: string;
  expectedVersion: number;
};

type HttpError = Error & {
  payload?: unknown;
  status?: number;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readSessionConflictResponse = (error: unknown): SessionConflictResponse | null => {
  if (!(error instanceof Error) || !("status" in error) || error.status !== 409) {
    return null;
  }
  const payload = "payload" in error ? error.payload : null;
  if (!isRecord(payload) || payload.code !== SESSION_VERSION_CONFLICT_CODE) {
    return null;
  }
  if (!isRecord(payload.session) || typeof payload.session.id !== "string") {
    return null;
  }
  return payload as unknown as SessionConflictResponse;
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
    const error = new Error(`Request failed: ${response.status}`) as HttpError;
    error.status = response.status;
    error.payload = await response.json().catch(() => null);
    throw error;
  }
  return (await response.json()) as T;
}

async function patchSessionRequest(
  sessionId: string,
  patch: SessionDocumentPatch,
  expectedVersion: number,
  options?: { keepalive?: boolean },
) {
  const body = JSON.stringify({
    ...patch,
    expectedVersion,
  });
  return fetchJson<SessionResponse>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body,
    keepalive: options?.keepalive === true,
  });
}

export function PersistedSessionsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = React.useState<SessionDocument | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [sessionConflict, setSessionConflict] = React.useState<SessionConflictState | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = React.useState(false);
  const activeSessionRef = React.useRef<SessionDocument | null>(null);
  const sessionsRef = React.useRef<SessionSummary[]>([]);
  const sessionConflictRef = React.useRef<SessionConflictState | null>(null);
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  React.useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  React.useEffect(() => {
    sessionConflictRef.current = sessionConflict;
  }, [sessionConflict]);

  const updateKnownSession = React.useCallback((sessionDoc: SessionDocument) => {
    setSessions((prev) => {
      const next = prev.map((item) => (item.id === sessionDoc.id ? sessionDoc : item));
      sessionsRef.current = next;
      return next;
    });
    if (activeSessionRef.current?.id === sessionDoc.id) {
      activeSessionRef.current = sessionDoc;
      setActiveSession(sessionDoc);
    }
  }, []);

  const registerSessionConflict = React.useCallback((
    sessionId: string,
    attemptedPatch: SessionDocumentPatch,
    error: unknown,
  ) => {
    const conflict = readSessionConflictResponse(error);
    if (!conflict) return false;
    const nextConflict = {
      attemptedPatch,
      currentSession: conflict.session,
      sessionId,
    } satisfies SessionConflictState;
    sessionConflictRef.current = nextConflict;
    setSessionConflict(nextConflict);
    return true;
  }, []);

  const loadSession = React.useCallback(async (sessionId: string) => {
    const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`);
    let sessionDoc = data.session;

    try {
      const cachedRaw = localStorage.getItem(`${SESSION_SNAPSHOT_CACHE_KEY_PREFIX}${sessionId}`);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as { snapshot?: unknown; savedAt?: unknown };
        const normalizedCachedSnapshot = normalizeSessionThreadExport(parsed?.snapshot);
        if (normalizedCachedSnapshot.messages.length > (sessionDoc.snapshot?.messages?.length ?? 0)) {
          const attemptedPatch = { snapshot: normalizedCachedSnapshot };
          const localSessionDoc = { ...sessionDoc, snapshot: normalizedCachedSnapshot };
          sessionDoc = localSessionDoc;
          const bodyBytes = new TextEncoder().encode(JSON.stringify({
            ...attemptedPatch,
            expectedVersion: data.session.version,
          })).length;
          try {
            const recovered = await patchSessionRequest(
              sessionId,
              attemptedPatch,
              data.session.version,
              { keepalive: bodyBytes <= KEEPALIVE_SAFE_BODY_BYTES },
            );
            sessionDoc = recovered.session;
          } catch (error) {
            registerSessionConflict(sessionId, attemptedPatch, error);
          }
        }
      }
    } catch {
      // ignore cache errors
    }

    activeSessionRef.current = sessionDoc;
    setActiveSession(sessionDoc);
    writeStoredActiveSessionId(userId, sessionDoc.id);
    return sessionDoc;
  }, [registerSessionConflict, userId]);

  const refreshSessions = React.useCallback(async () => {
    const data = await fetchJson<SessionsListResponse>("/api/sessions?includeArchived=1");
    sessionsRef.current = data.sessions;
    setSessions(data.sessions);
    return data.sessions;
  }, []);

  const bootstrap = React.useCallback(async () => {
    if (status === "loading") {
      return;
    }
    if (!userId) {
      sessionsRef.current = [];
      activeSessionRef.current = null;
      setSessions([]);
      setActiveSession(null);
      setIsReady(true);
      return;
    }
    setIsReady(false);
    try {
      let nextSessions = await refreshSessions();

      if (nextSessions.length === 0) {
        const created = await fetchJson<SessionResponse>("/api/sessions", {
          method: "POST",
          body: JSON.stringify({}),
        });
        nextSessions = [created.session, ...nextSessions.filter((item) => item.id !== created.session.id)];
        sessionsRef.current = nextSessions;
        activeSessionRef.current = created.session;
        setSessions(nextSessions);
        setActiveSession(created.session);
        writeStoredActiveSessionId(userId, created.session.id);
        return;
      }

      sessionsRef.current = nextSessions;
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
            activeSessionRef.current = null;
            setActiveSession(null);
            writeStoredActiveSessionId(userId, null);
          }
        }
      } else {
        activeSessionRef.current = null;
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
    const nextSessions = [data.session, ...sessionsRef.current];
    sessionsRef.current = nextSessions;
    activeSessionRef.current = data.session;
    setSessions(nextSessions);
    setActiveSession(data.session);
    writeStoredActiveSessionId(userId, data.session.id);
    setIsReady(true);
  }, [userId]);

  const getKnownSession = React.useCallback((sessionId: string) => {
    if (activeSessionRef.current?.id === sessionId) {
      return activeSessionRef.current;
    }
    return sessionsRef.current.find((item) => item.id === sessionId) ?? null;
  }, []);

  const archiveSession = React.useCallback(async (sessionId: string) => {
    const knownSession = getKnownSession(sessionId);
    if (!knownSession) return;
    const attemptedPatch = { archived: true };
    let data: SessionResponse;
    try {
      data = await patchSessionRequest(sessionId, attemptedPatch, knownSession.version);
    } catch (error) {
      if (registerSessionConflict(sessionId, attemptedPatch, error)) return;
      throw error;
    }
    updateKnownSession(data.session);
    const remaining = await refreshSessions();
    if (activeSessionRef.current?.id !== sessionId) {
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
    activeSessionRef.current = data.session;
    setActiveSession(data.session);
    await createSession();
  }, [createSession, getKnownSession, loadSession, refreshSessions, registerSessionConflict, updateKnownSession]);

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

    if (!activeSessionRef.current?.id || !uniqueSessionIds.includes(activeSessionRef.current.id)) {
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
    activeSessionRef.current = null;
    setActiveSession(null);
    await createSession();
  }, [createSession, loadSession, refreshSessions, userId]);

  const deleteSession = React.useCallback(async (sessionId: string) => {
    await deleteSessions([sessionId]);
  }, [deleteSessions]);

  const recoverMissingSession = React.useCallback(async (sessionId: string) => {
    let remaining: SessionSummary[] = [];
    try {
      remaining = await refreshSessions();
    } catch {
      const next = sessionsRef.current.filter((item) => item.id !== sessionId);
      sessionsRef.current = next;
      setSessions(next);
    }

    const visibleSessions = remaining.filter((item) => item.id !== sessionId);
    if (remaining.length > 0) {
      sessionsRef.current = visibleSessions;
      setSessions(visibleSessions);
    }

    if (activeSessionRef.current?.id !== sessionId) {
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
        activeSessionRef.current = null;
        setActiveSession(null);
        await createSession();
      } finally {
        setIsReady(true);
      }
      return;
    }

    writeStoredActiveSessionId(userId, null);
    activeSessionRef.current = null;
    setActiveSession(null);
    await createSession();
  }, [createSession, loadSession, refreshSessions, userId]);

  const renameSession = React.useCallback(async (sessionId: string, title: string | null) => {
    const knownSession = getKnownSession(sessionId);
    if (!knownSession) return;
    const attemptedPatch = { title };
    try {
      const data = await patchSessionRequest(sessionId, attemptedPatch, knownSession.version);
      updateKnownSession(data.session);
    } catch (error) {
      if (registerSessionConflict(sessionId, attemptedPatch, error)) return;
      if ((error as { status?: number })?.status === 404) {
        await recoverMissingSession(sessionId);
        return;
      }
      throw error;
    }
  }, [getKnownSession, recoverMissingSession, registerSessionConflict, updateKnownSession]);

  const saveActiveSessionDocumentPatch = React.useCallback((patch: ActiveSessionDocumentPatch) => {
    const targetSessionId = activeSessionRef.current?.id ?? null;
    if (!targetSessionId) return Promise.resolve();

    const run = async () => {
      if (sessionConflictRef.current?.sessionId === targetSessionId) return;
      const current = activeSessionRef.current?.id === targetSessionId
        ? activeSessionRef.current
        : null;
      if (!current) return;
      try {
        const bodyBytes = new TextEncoder().encode(JSON.stringify({
          ...patch,
          expectedVersion: current.version,
        })).length;
        const data = await patchSessionRequest(
          targetSessionId,
          patch,
          current.version,
          { keepalive: bodyBytes <= KEEPALIVE_SAFE_BODY_BYTES },
        );
        activeSessionRef.current = data.session;
        setActiveSession(data.session);
        setSessions((prev) => {
          const next = prev.map((item) => (item.id === data.session.id ? data.session : item));
          sessionsRef.current = next;
          return next;
        });
      } catch (error) {
        if (registerSessionConflict(targetSessionId, patch, error)) return;
        if ((error as { status?: number })?.status === 404) return;
        throw error;
      }
    };

    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [registerSessionConflict]);

  const saveActiveSessionSnapshot = React.useCallback(async (snapshot: SessionThreadExport) => {
    await saveActiveSessionDocumentPatch({ snapshot });
  }, [saveActiveSessionDocumentPatch]);

  const loadLatestConflictVersion = React.useCallback(() => {
    const conflict = sessionConflictRef.current;
    if (!conflict) return;
    updateKnownSession(conflict.currentSession);
    if (activeSessionRef.current?.id === conflict.sessionId) {
      try {
        localStorage.removeItem(`${SESSION_SNAPSHOT_CACHE_KEY_PREFIX}${conflict.sessionId}`);
      } catch {
        // ignore cache errors
      }
    }
    sessionConflictRef.current = null;
    setSessionConflict(null);
  }, [updateKnownSession]);

  const keepLocalConflictVersion = React.useCallback(async () => {
    const conflict = sessionConflictRef.current;
    if (!conflict || isResolvingConflict) return;
    setIsResolvingConflict(true);
    try {
      const data = await patchSessionRequest(
        conflict.sessionId,
        conflict.attemptedPatch,
        conflict.currentSession.version,
      );
      updateKnownSession(data.session);
      sessionConflictRef.current = null;
      setSessionConflict(null);
    } catch (error) {
      registerSessionConflict(conflict.sessionId, conflict.attemptedPatch, error);
    } finally {
      setIsResolvingConflict(false);
    }
  }, [isResolvingConflict, registerSessionConflict, updateKnownSession]);

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
      {sessionConflict ? (
        <div
          role="alertdialog"
          aria-labelledby="session-conflict-title"
          aria-describedby="session-conflict-description"
          className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-amber-500/40 bg-background/95 p-4 shadow-2xl backdrop-blur"
        >
          <p id="session-conflict-title" className="text-sm font-semibold text-foreground">
            Session changed elsewhere
          </p>
          <p id="session-conflict-description" className="mt-1 text-sm text-muted-foreground">
            Another tab, device, or agent saved a newer version. Choose which version should remain.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              onClick={loadLatestConflictVersion}
              disabled={isResolvingConflict}
            >
              Load latest
            </button>
            <button
              type="button"
              className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
              onClick={() => void keepLocalConflictVersion()}
              disabled={isResolvingConflict}
            >
              {isResolvingConflict ? "Saving…" : "Keep my changes"}
            </button>
          </div>
        </div>
      ) : null}
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
