"use client";

import React from "react";
import {
  patchSessionRequest,
  shouldKeepaliveSessionPatch,
  type ActiveSessionDocumentPatch,
} from "@/lib/client/session-persistence";
import { SessionConflictDialog } from "@/components/context/session-conflict-dialog";
import {
  usePersistedResourceState,
  useSerialTaskQueue,
} from "@/components/context/use-persisted-resource-state";
import { useSessionConflictResolution } from "@/components/context/use-session-conflict-resolution";
import { useSessionLifecycle } from "@/components/context/use-session-lifecycle";
import { useSession } from "next-auth/react";
import type {
  SessionDocument,
  SessionSummary,
  SessionThreadExport,
} from "@/lib/session-documents";

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

const PersistedSessionsContext = React.createContext<PersistedSessionsContextValue | null>(null);

export function PersistedSessionsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const {
    activeResource: activeSession,
    activeResourceRef: activeSessionRef,
    getKnownResource: getKnownSession,
    prependResource: prependSession,
    resources: sessions,
    resourcesRef: sessionsRef,
    setActiveResource: setActiveSession,
    setResources: setSessions,
    updateKnownResource: updateKnownSession,
  } = usePersistedResourceState<SessionSummary, SessionDocument>();
  const enqueueSessionSave = useSerialTaskQueue<void>(undefined);
  const {
    hasSessionConflict,
    isResolvingConflict,
    keepLocalConflictVersion,
    loadLatestConflictVersion,
    registerSessionConflict,
    sessionConflict,
  } = useSessionConflictResolution({
    activeSessionRef,
    updateKnownSession,
  });
  const {
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    recoverMissingSession,
    selectSession,
  } = useSessionLifecycle({
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
  });

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
      if (hasSessionConflict(targetSessionId)) return;
      const current = activeSessionRef.current?.id === targetSessionId
        ? activeSessionRef.current
        : null;
      if (!current) return;
      try {
        const data = await patchSessionRequest(
          targetSessionId,
          patch,
          current.version,
          {
            keepalive: shouldKeepaliveSessionPatch(patch, current.version),
          },
        );
        updateKnownSession(data.session);
      } catch (error) {
        if (registerSessionConflict(targetSessionId, patch, error)) return;
        if ((error as { status?: number })?.status === 404) return;
        throw error;
      }
    };

    return enqueueSessionSave(run);
  }, [
    activeSessionRef,
    enqueueSessionSave,
    hasSessionConflict,
    registerSessionConflict,
    updateKnownSession,
  ]);

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
      <SessionConflictDialog
        conflict={sessionConflict}
        isResolving={isResolvingConflict}
        onKeepLocal={() => void keepLocalConflictVersion()}
        onLoadLatest={loadLatestConflictVersion}
      />
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
