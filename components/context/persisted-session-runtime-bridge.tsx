"use client";

import React from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { MessageFormatRepository } from "@assistant-ui/core";
import type { UIMessage } from "ai";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import type { SessionThreadExport } from "@/lib/session-documents";
import {
  mergeRuntimeBranchIntoSessionSnapshot,
  mergeSessionSnapshotRepositories,
} from "@/lib/session-runtime-snapshot";
import {
  FORCE_PERSIST_SESSION_EVENT,
  SESSION_RUNTIME_CHANGED_EVENT,
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

const toUiMessagePart = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "text" || value.type === "reasoning") {
    return typeof value.text === "string"
      ? { type: value.type, text: value.text }
      : null;
  }
  if (value.type === "image") {
    const url =
      typeof value.image === "string"
        ? value.image
        : typeof value.url === "string"
          ? value.url
          : null;
    if (!url) return null;
    return {
      type: "file",
      url,
      mediaType:
        typeof value.mediaType === "string"
          ? value.mediaType
          : typeof value.mimeType === "string"
            ? value.mimeType
            : "image/*",
      ...(typeof value.filename === "string" ? { filename: value.filename } : {}),
    };
  }
  if (value.type === "file") {
    const url =
      typeof value.url === "string"
        ? value.url
        : typeof value.data === "string"
          ? value.data
          : typeof value.content === "string"
            ? value.content
            : null;
    const mediaType =
      typeof value.mediaType === "string"
        ? value.mediaType
        : typeof value.mimeType === "string"
          ? value.mimeType
          : null;
    if (!url || !mediaType) return null;
    return {
      type: "file",
      url,
      mediaType,
      ...(typeof value.filename === "string"
        ? { filename: value.filename }
        : typeof value.name === "string"
          ? { filename: value.name }
          : {}),
    };
  }
  return null;
};

const toUiMessage = (value: unknown): UIMessage | null => {
  if (isUiMessageLike(value)) return value;
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (value.role !== "user" && value.role !== "assistant" && value.role !== "system") {
    return null;
  }
  const sourceParts = Array.isArray(value.parts)
    ? value.parts
    : Array.isArray(value.content)
      ? value.content
      : typeof value.content === "string"
        ? [{ type: "text", text: value.content }]
        : [];
  const parts = sourceParts
    .map(toUiMessagePart)
    .filter((part): part is Record<string, unknown> => part !== null);
  if (parts.length === 0) return null;
  return {
    id: value.id,
    role: value.role,
    parts,
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
  } as unknown as UIMessage;
};

const toExternalStateRepository = (
  snapshot: SessionThreadExport,
): MessageFormatRepository<UIMessage> => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.flatMap((entry) => {
    const message = toUiMessage(entry.message);
    return message ? [{ parentId: entry.parentId, message }] : [];
  }),
});

const canImportAsExternalState = (snapshot: SessionThreadExport) =>
  snapshot.messages.length > 0 &&
  toExternalStateRepository(snapshot).messages.length === snapshot.messages.length;

const toComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: entry.message,
  })),
});

const getHydrationText = (message: Record<string, unknown>) => {
  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : [];
  return parts
    .flatMap((part) =>
      isRecord(part) && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
};

const toHydrationComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    id: typeof entry.message.id === "string" ? entry.message.id : null,
    role: typeof entry.message.role === "string" ? entry.message.role : null,
    text: isRecord(entry.message) ? getHydrationText(entry.message) : "",
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

const exportRuntimeSnapshot = (
  thread: AssistantRuntime["threads"]["main"],
): SessionThreadExport => {
  let repositorySnapshot: SessionThreadExport | null = null;
  try {
    repositorySnapshot = toPersistedSnapshot(thread.export());
  } catch {
    // The runtime can temporarily be a remote-thread placeholder during mount.
  }

  let runtimeBranch: Record<string, unknown>[] = [];
  try {
    runtimeBranch = thread
      .getState()
      .messages.filter((message) => isRecord(message))
      .map((message) => normalizeAssistantStatusForPersistence(message));
  } catch {
    // Keep the repository export as the fallback when state is not ready yet.
  }

  return mergeRuntimeBranchIntoSessionSnapshot(repositorySnapshot, runtimeBranch);
};

export function PersistedSessionRuntimeBridge() {
  const runtime = useAssistantRuntime();
  const { activeSession, saveActiveSessionSnapshot } = usePersistedSessions();
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionSnapshot = activeSession?.snapshot ?? null;
  const importedSessionIdRef = React.useRef<string | null>(null);
  const latestPersistedSessionIdRef = React.useRef<string | null>(null);
  const latestPersistedSnapshotRef = React.useRef<SessionThreadExport | null>(null);
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

    const incomingSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const sanitizedSnapshot =
      latestPersistedSessionIdRef.current === activeSessionId
        ? mergeSessionSnapshotRepositories(
            latestPersistedSnapshotRef.current,
            incomingSnapshot,
          )
        : incomingSnapshot;
    latestPersistedSessionIdRef.current = activeSessionId;
    latestPersistedSnapshotRef.current = sanitizedSnapshot;
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
    const nextHydrationSignature = JSON.stringify(
      toHydrationComparableSnapshot(sanitizedSnapshot),
    );

    // Snapshot updates for the currently mounted session are acknowledgements of
    // local saves, not navigation events. Re-importing them while Assistant UI is
    // creating a branch can invalidate the message lookup indexes.
    if (importedSessionIdRef.current === activeSessionId) {
      lastSavedSignatureRef.current = nextSignature;
      return;
    }

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
          exportRuntimeSnapshot(runtime.threads.main);
        const runtimeSignature = JSON.stringify(
          toHydrationComparableSnapshot(currentPersisted),
        );
        const switchingSessions = importedSessionIdRef.current !== activeSessionId;
        if (runActiveRef.current && !switchingSessions) {
          scheduleImportRetry();
          return;
        }
        const safeToHydrate = switchingSessions || currentPersisted.messages.length === 0;

        if (runtimeSignature === nextHydrationSignature) {
          importedSessionIdRef.current = activeSessionId;
          lastSavedSignatureRef.current = nextSignature;
          clearImportRetry();
          return;
        }

        if (!safeToHydrate) {
          clearImportRetry();
          return;
        }

        if (canImportAsExternalState(sanitizedSnapshot)) {
          runtime.threads.main.importExternalState(
            toExternalStateRepository(sanitizedSnapshot),
          );
        } else {
          runtime.threads.main.import(toRuntimeSnapshot(sanitizedSnapshot));
        }

        const importedPersisted =
          exportRuntimeSnapshot(runtime.threads.main);
        const importedSignature = JSON.stringify(
          toHydrationComparableSnapshot(importedPersisted),
        );
        if (importedSignature === nextHydrationSignature) {
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
    const readMergedPersistedSnapshot = () => {
      const exportedSnapshot = exportRuntimeSnapshot(thread);
      const persistedSnapshot = sanitizePersistedSnapshot(
        mergeSessionSnapshotRepositories(
          latestPersistedSessionIdRef.current === activeSessionId
            ? latestPersistedSnapshotRef.current
            : null,
          exportedSnapshot,
        ),
      );
      latestPersistedSessionIdRef.current = activeSessionId;
      latestPersistedSnapshotRef.current = persistedSnapshot;
      return persistedSnapshot;
    };
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
      const persistedSnapshot = readMergedPersistedSnapshot();
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
        const persistedSnapshot = readMergedPersistedSnapshot();
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
        scheduleFlush();
        resolvePendingForcePersists();
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
    const handleRuntimeChanged = () => {
      // The rendered Assistant UI branch is the source of truth even when the
      // adapter leaves run lifecycle flags stale after the stream has rendered.
      runActiveRef.current = false;
      scheduleFlush();
      resolvePendingForcePersists();
    };
    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
    window.addEventListener(SESSION_RUNTIME_CHANGED_EVENT, handleRuntimeChanged);

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
      window.removeEventListener(SESSION_RUNTIME_CHANGED_EVENT, handleRuntimeChanged);
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
