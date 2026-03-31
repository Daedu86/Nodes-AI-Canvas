"use client";

import React from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import type { AssistantRuntime } from "@assistant-ui/react";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import type { SessionThreadExport } from "@/lib/session-documents";

const THREAD_EVENTS = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
] as const;
const FORCE_PERSIST_EVENT = "assistant-ui:force-persist-session";

type ThreadExport = ReturnType<AssistantRuntime["threads"]["main"]["export"]>;

const toRuntimeSnapshot = (snapshot: SessionThreadExport) =>
  snapshot as unknown as ThreadExport;

const toPersistedSnapshot = (snapshot: ThreadExport) =>
  snapshot as unknown as SessionThreadExport;

export function PersistedSessionRuntimeBridge() {
  const runtime = useAssistantRuntime();
  const { activeSession, saveActiveSessionSnapshot } = usePersistedSessions();
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionSnapshot = activeSession?.snapshot ?? null;
  const importedSessionIdRef = React.useRef<string | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const saveActiveSessionSnapshotRef = React.useRef(saveActiveSessionSnapshot);

  React.useEffect(() => {
    saveActiveSessionSnapshotRef.current = saveActiveSessionSnapshot;
  }, [saveActiveSessionSnapshot]);

  React.useEffect(() => {
    if (!runtime || !activeSessionId || !activeSessionSnapshot) return;
    if (importedSessionIdRef.current === activeSessionId) return;

    try {
      runtime.threads.main.import(toRuntimeSnapshot(activeSessionSnapshot));
      importedSessionIdRef.current = activeSessionId;
      lastSavedSignatureRef.current = JSON.stringify(activeSessionSnapshot);
    } catch {
      // ignore import failures; runtime stays empty
    }
  }, [activeSessionId, activeSessionSnapshot, runtime]);

  React.useEffect(() => {
    if (!runtime || !activeSessionId) return;
    const thread = runtime.threads.main;

    const flush = () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const snapshot = thread.export();
      const signature = JSON.stringify(snapshot);
      if (signature === lastSavedSignatureRef.current) {
        return;
      }
      lastSavedSignatureRef.current = signature;
      void saveActiveSessionSnapshotRef.current(toPersistedSnapshot(snapshot));
    };

    const scheduleFlush = () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        flush();
      }, 250);
    };

    const unsubscribes: Array<() => void> = [thread.subscribe(scheduleFlush)];
    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, scheduleFlush));
    });
    const handleForcePersist = () => {
      scheduleFlush();
    };
    window.addEventListener(FORCE_PERSIST_EVENT, handleForcePersist);

    return () => {
      flush();
      window.removeEventListener(FORCE_PERSIST_EVENT, handleForcePersist);
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup failures
        }
      });
    };
  }, [activeSessionId, runtime]);

  return null;
}
