"use client";

import React from "react";
import type { SessionDocument } from "@/lib/session-documents";
import {
  clearSessionSnapshotCache,
  patchSessionRequest,
  readSessionConflictResponse,
  type SessionConflictState,
  type SessionDocumentPatch,
} from "@/lib/client/session-persistence";

type UseSessionConflictResolutionOptions = {
  activeSessionRef: React.RefObject<SessionDocument | null>;
  updateKnownSession: (session: SessionDocument) => void;
};

export const matchesSessionConflict = (
  conflict: SessionConflictState | null,
  sessionId: string,
) => conflict?.sessionId === sessionId;

export function useSessionConflictResolution({
  activeSessionRef,
  updateKnownSession,
}: UseSessionConflictResolutionOptions) {
  const [sessionConflict, setSessionConflict] =
    React.useState<SessionConflictState | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = React.useState(false);
  const sessionConflictRef = React.useRef<SessionConflictState | null>(null);

  React.useEffect(() => {
    sessionConflictRef.current = sessionConflict;
  }, [sessionConflict]);

  const registerSessionConflict = React.useCallback(
    (
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
    },
    [],
  );

  const hasSessionConflict = React.useCallback(
    (sessionId: string) =>
      matchesSessionConflict(sessionConflictRef.current, sessionId),
    [],
  );

  const loadLatestConflictVersion = React.useCallback(() => {
    const conflict = sessionConflictRef.current;
    if (!conflict) return;
    updateKnownSession(conflict.currentSession);
    if (activeSessionRef.current?.id === conflict.sessionId) {
      clearSessionSnapshotCache(conflict.sessionId);
    }
    sessionConflictRef.current = null;
    setSessionConflict(null);
  }, [activeSessionRef, updateKnownSession]);

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
      registerSessionConflict(
        conflict.sessionId,
        conflict.attemptedPatch,
        error,
      );
    } finally {
      setIsResolvingConflict(false);
    }
  }, [isResolvingConflict, registerSessionConflict, updateKnownSession]);

  return {
    hasSessionConflict,
    isResolvingConflict,
    keepLocalConflictVersion,
    loadLatestConflictVersion,
    registerSessionConflict,
    sessionConflict,
  };
}
