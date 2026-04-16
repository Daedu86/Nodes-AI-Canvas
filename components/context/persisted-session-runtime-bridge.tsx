"use client";

import React from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { MessageFormatRepository } from "@assistant-ui/core";
import type { UIMessage } from "ai";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import type { SessionThreadExport } from "@/lib/session-documents";
import {
  FORCE_PERSIST_SESSION_EVENT,
  markSessionPersistPending,
  registerSessionPersistHandler,
  markSessionPersistSettled,
} from "@/lib/session-persist-sync";

const THREAD_EVENTS = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
] as const;
type ForcePersistEventDetail = {
  resolve?: () => void;
};

type ThreadExport = ReturnType<AssistantRuntime["threads"]["main"]["export"]>;
const SESSION_SNAPSHOT_CACHE_KEY_PREFIX = "nodes.session-snapshot-cache.v1:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toRuntimeSnapshot = (snapshot: SessionThreadExport) =>
  snapshot as unknown as ThreadExport;

const normalizeAssistantStatusForPersistence = (message: Record<string, unknown>) => {
  if (message.role !== "assistant") return message;
  const status = isRecord(message.status) ? message.status : null;
  if (status?.type !== "running") return message;

  // We cannot resume a streaming run after reload/navigation, so persisting a "running" assistant
  // leaves the thread stuck (Send disappears and new sends get blocked).
  return {
    ...message,
    status: {
      type: "incomplete",
      reason: "cancelled",
    },
  };
};

const sanitizePersistedSnapshot = (snapshot: SessionThreadExport): SessionThreadExport => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: isRecord(entry.message)
      ? normalizeAssistantStatusForPersistence(entry.message)
      : entry.message,
  })),
});

const isUiMessageLike = (value: unknown): value is UIMessage =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.role === "user" || value.role === "assistant" || value.role === "system") &&
  Array.isArray((value as { parts?: unknown }).parts);

const isExternalStateSnapshot = (snapshot: SessionThreadExport) =>
  snapshot.messages.some((entry) => isUiMessageLike(entry.message));

const toExternalStateRepository = (
  snapshot: SessionThreadExport,
): MessageFormatRepository<UIMessage> => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages
    .filter((entry) => isUiMessageLike(entry.message))
    .map((entry) => ({
      parentId: entry.parentId,
      message: entry.message as unknown as UIMessage,
    })),
});

const exportExternalStateAsSnapshot = (
  thread: AssistantRuntime["threads"]["main"],
): SessionThreadExport | null => {
  try {
    const exported = (thread as unknown as { exportExternalState?: () => MessageFormatRepository<UIMessage> })
      .exportExternalState?.();
    if (!exported || !Array.isArray(exported.messages)) {
      return null;
    }
    return {
      headId: exported.headId ?? null,
      messages: exported.messages.map((item) => ({
        parentId: item.parentId ?? null,
        message: item.message as unknown as Record<string, unknown>,
      })),
    };
  } catch {
    return null;
  }
};

const toComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: entry.message,
  })),
});

const getSnapshotMessageCount = (snapshot: unknown) => {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const messages = (snapshot as { messages?: unknown }).messages;
  return Array.isArray(messages) ? messages.length : 0;
};

const writeSnapshotCacheIfNewer = (sessionId: string, next: SessionThreadExport) => {
  try {
    const key = `${SESSION_SNAPSHOT_CACHE_KEY_PREFIX}${sessionId}`;
    const existingRaw = window.localStorage.getItem(key);
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw) as { snapshot?: unknown } | null;
      const existingCount = getSnapshotMessageCount(parsed?.snapshot);
      const nextCount = next.messages.length;
      if (existingCount > nextCount) {
        return;
      }
    }
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), snapshot: next }));
  } catch {
    // ignore cache errors
  }
};

const toPersistedSnapshot = (snapshot: ThreadExport): SessionThreadExport => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: isRecord(entry.message)
      ? normalizeAssistantStatusForPersistence(entry.message)
      : entry.message,
  })),
});

export function PersistedSessionRuntimeBridge() {
  const runtime = useAssistantRuntime();
  const { activeSession, saveActiveSessionSnapshot } = usePersistedSessions();
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionSnapshot = activeSession?.snapshot ?? null;
  const importedSessionIdRef = React.useRef<string | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
  const importTimeoutRef = React.useRef<number | null>(null);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const saveActiveSessionSnapshotRef = React.useRef(saveActiveSessionSnapshot);
  const runActiveRef = React.useRef(false);
  const pendingForcePersistResolversRef = React.useRef<Array<() => void>>([]);

  React.useEffect(() => {
    saveActiveSessionSnapshotRef.current = saveActiveSessionSnapshot;
  }, [saveActiveSessionSnapshot]);

  React.useEffect(() => {
    if (!runtime || !activeSessionId || !activeSessionSnapshot) return;
    let cancelled = false;

    const sanitizedSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
    const clearImportRetry = () => {
      if (importTimeoutRef.current !== null) {
        window.clearTimeout(importTimeoutRef.current);
        importTimeoutRef.current = null;
      }
    };
    const scheduleImportRetry = () => {
      if (cancelled || importTimeoutRef.current !== null) {
        return;
      }
      importTimeoutRef.current = window.setTimeout(() => {
        importTimeoutRef.current = null;
        attemptImport();
      }, 50);
    };

    const attemptImport = () => {
      if (cancelled) {
        return;
      }

      try {
        const currentPersisted =
          exportExternalStateAsSnapshot(runtime.threads.main) ??
          toPersistedSnapshot(runtime.threads.main.export());
        const runtimeSignature = JSON.stringify(toComparableSnapshot(currentPersisted));
        const switchingSessions = importedSessionIdRef.current !== activeSessionId;
        if (runActiveRef.current && !switchingSessions) {
          scheduleImportRetry();
          return;
        }
        const safeToHydrate = switchingSessions || currentPersisted.messages.length === 0;

        if (runtimeSignature === nextSignature) {
          importedSessionIdRef.current = activeSessionId;
          lastSavedSignatureRef.current = nextSignature;
          clearImportRetry();
          return;
        }

        if (!safeToHydrate) {
          clearImportRetry();
          return;
        }

        if (isExternalStateSnapshot(sanitizedSnapshot)) {
          runtime.threads.main.importExternalState(toExternalStateRepository(sanitizedSnapshot));
        } else {
          runtime.threads.main.import(toRuntimeSnapshot(sanitizedSnapshot));
        }

        const importedPersisted =
          exportExternalStateAsSnapshot(runtime.threads.main) ??
          toPersistedSnapshot(runtime.threads.main.export());
        const importedSignature = JSON.stringify(toComparableSnapshot(importedPersisted));
        if (importedSignature === nextSignature) {
          importedSessionIdRef.current = activeSessionId;
          lastSavedSignatureRef.current = nextSignature;
          clearImportRetry();
          return;
        }
      } catch {
        // Runtime can still be the remote-thread placeholder during mount.
      }

      scheduleImportRetry();
    };

    attemptImport();

    return () => {
      cancelled = true;
      clearImportRetry();
    };
  }, [activeSessionId, activeSessionSnapshot, runtime]);

  React.useEffect(() => {
    if (!runtime || !activeSessionId) return;
    const thread = runtime.threads.main;
    const unregisterForcePersistHandler = registerSessionPersistHandler();

    const resolvePendingForcePersists = () => {
      const resolvers = pendingForcePersistResolversRef.current.splice(0);
      resolvers.forEach((resolve) => {
        try {
          resolve();
        } catch {
          // ignore resolver failures
        }
      });
    };

    const flush = async ({ allowEmptyOverride = false }: { allowEmptyOverride?: boolean } = {}) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const persistedSnapshot =
        exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export());
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));

      // Local fallback cache: helps restore conversation state if the user closes/navigates
      // before the server PATCH completes.
      writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);

      if (
        !allowEmptyOverride &&
        persistedSnapshot.messages.length === 0 &&
        lastSavedSignatureRef.current !== null &&
        signature !== lastSavedSignatureRef.current
      ) {
        return;
      }
      if (signature === lastSavedSignatureRef.current) {
        markSessionPersistSettled();
        return;
      }
      lastSavedSignatureRef.current = signature;
      try {
        await saveActiveSessionSnapshotRef.current(persistedSnapshot);
      } finally {
        markSessionPersistSettled();
      }
    };

    const scheduleFlush = () => {
      markSessionPersistPending();

      // Cache immediately so a fast close/reopen can restore even if the server PATCH is interrupted.
      try {
        const persistedSnapshot =
          exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export());
        writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);
      } catch {
        // ignore cache errors
      }

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        void flush();
      }, 250);
    };

    const unsubscribes: Array<() => void> = [thread.subscribe(scheduleFlush)];
    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, scheduleFlush));
    });
    unsubscribes.push(
      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        markSessionPersistPending();
        // Persist immediately at run start so a quick close/reopen still restores the user message.
        void flush({ allowEmptyOverride: true });
      }),
    );
    unsubscribes.push(
      thread.unstable_on("runEnd", () => {
        runActiveRef.current = false;
        // Flush immediately at run end so reopening the app right after a reply
        // still restores the latest conversation state.
        void flush({ allowEmptyOverride: true }).finally(() => {
          if (pendingForcePersistResolversRef.current.length === 0) {
            return;
          }
          resolvePendingForcePersists();
        });
      }),
    );
    const handleForcePersist = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as ForcePersistEventDetail | undefined) : undefined;
      if (runActiveRef.current) {
        if (detail?.resolve) {
          pendingForcePersistResolversRef.current.push(detail.resolve);
        }
        return;
      }
      void flush().finally(() => {
        detail?.resolve?.();
      });
    };
    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);

    // Best-effort persistence when the tab/app is backgrounded or closed.
    // This addresses "messages disappeared after reopening" by using fetch keepalive on PATCH.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      void flush({ allowEmptyOverride: true });
    };
    const handlePageHide = () => {
      void flush({ allowEmptyOverride: true });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      runActiveRef.current = false;
      resolvePendingForcePersists();
      unregisterForcePersistHandler();
      if (importTimeoutRef.current !== null) {
        window.clearTimeout(importTimeoutRef.current);
        importTimeoutRef.current = null;
      }
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      window.removeEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
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
