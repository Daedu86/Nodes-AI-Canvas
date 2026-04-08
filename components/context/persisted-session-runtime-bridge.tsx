"use client";

import React from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import type { AssistantRuntime } from "@assistant-ui/react";
import { getExternalStoreMessages } from "@assistant-ui/core";
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
const PERSISTED_EXTERNAL_MESSAGES_KEY = "__assistantUiExternalMessages";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toRuntimeSnapshot = (snapshot: SessionThreadExport) =>
  snapshot as unknown as ThreadExport;

const cloneJsonValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const stripPersistedExternalMessages = (message: Record<string, unknown>) => {
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const custom = metadata && isRecord(metadata.custom) ? metadata.custom : null;
  if (!custom || !(PERSISTED_EXTERNAL_MESSAGES_KEY in custom)) {
    return message;
  }

  const nextCustom = { ...custom };
  delete nextCustom[PERSISTED_EXTERNAL_MESSAGES_KEY];
  return {
    ...message,
    metadata: {
      ...metadata,
      custom: nextCustom,
    },
  };
};

const toComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: isRecord(entry.message)
      ? stripPersistedExternalMessages(entry.message)
      : entry.message,
  })),
});

const toUiMessageParts = (value: unknown) => {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value.reduce<Array<Record<string, unknown>>>((parts, part) => {
    if (!isRecord(part) || typeof part.type !== "string") {
      return parts;
    }

    switch (part.type) {
      case "text":
        if (typeof part.text === "string") {
          parts.push({ type: "text", text: part.text, state: "done" as const });
        }
        return parts;
      case "reasoning":
        if (typeof part.text === "string") {
          parts.push({ type: "reasoning", text: part.text, state: "done" as const });
        }
        return parts;
      case "source":
        if (part.sourceType === "url" && typeof part.url === "string") {
          parts.push({
              type: "source-url",
              sourceId: typeof part.id === "string" ? part.id : undefined,
              url: part.url,
              title: typeof part.title === "string" ? part.title : "",
            });
        }
        return parts;
      case "file":
        if (typeof part.data === "string" && typeof part.mimeType === "string") {
          parts.push({
              type: "file",
              url: part.data,
              mediaType: part.mimeType,
              ...(typeof part.filename === "string" ? { filename: part.filename } : {}),
            });
        }
        return parts;
      case "data":
        if (typeof part.name === "string") {
          parts.push({ type: `data-${part.name}`, data: part.data });
        }
        return parts;
      default:
        return parts;
    }
  }, []);
};

const buildFallbackExternalMessages = (message: Record<string, unknown>): UIMessage[] => {
  const id = typeof message.id === "string" ? message.id : null;
  const role =
    message.role === "user" || message.role === "assistant" || message.role === "system"
      ? message.role
      : null;

  if (!id || !role) {
    return [];
  }

  return [
    {
      id,
      role,
      metadata: message.metadata,
      parts: toUiMessageParts(message.content),
    } as UIMessage,
  ];
};

const readPersistedExternalMessages = (message: Record<string, unknown>) => {
  const custom = isRecord(message.metadata) && isRecord(message.metadata.custom)
    ? message.metadata.custom
    : null;
  const embedded = custom?.[PERSISTED_EXTERNAL_MESSAGES_KEY];
  if (Array.isArray(embedded)) {
    return embedded.filter(isRecord) as unknown as UIMessage[];
  }
  return buildFallbackExternalMessages(message);
};

const toExternalStateSnapshot = (
  snapshot: SessionThreadExport,
): MessageFormatRepository<UIMessage> | null => {
  if (!Array.isArray(snapshot.messages) || snapshot.messages.length === 0) {
    return { messages: [], headId: snapshot.headId ?? null };
  }

  const outerToInnerHead = new Map<string, string>();
  const messages = snapshot.messages.flatMap((entry) => {
    if (!isRecord(entry.message)) {
      return [];
    }

    const externalMessages = readPersistedExternalMessages(entry.message);
    if (externalMessages.length === 0) {
      return [];
    }

    let parentId =
      entry.parentId && outerToInnerHead.has(entry.parentId)
        ? outerToInnerHead.get(entry.parentId) ?? null
        : entry.parentId;

    const mapped = externalMessages.map((message) => {
      const item = {
        parentId,
        message,
      };
      parentId = message.id;
      return item;
    });

    const outerId = typeof entry.message.id === "string" ? entry.message.id : null;
    const innerHeadId = externalMessages.at(-1)?.id ?? null;
    if (outerId && innerHeadId) {
      outerToInnerHead.set(outerId, innerHeadId);
    }

    return mapped;
  });

  return {
    messages,
    headId:
      snapshot.headId && outerToInnerHead.has(snapshot.headId)
        ? outerToInnerHead.get(snapshot.headId) ?? snapshot.headId
        : snapshot.headId ?? null,
  };
};

const toPersistedSnapshot = (snapshot: ThreadExport): SessionThreadExport => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => {
    const message = entry.message as Record<string, unknown>;
    const metadata = isRecord(message.metadata) ? message.metadata : {};
    const custom = isRecord(metadata.custom) ? metadata.custom : {};
    const externalMessages = getExternalStoreMessages<UIMessage>(entry.message);

    return {
      parentId: entry.parentId,
      message: {
        ...message,
        metadata: {
          ...metadata,
          custom: {
            ...custom,
            ...(externalMessages.length > 0
              ? {
                  [PERSISTED_EXTERNAL_MESSAGES_KEY]: cloneJsonValue(externalMessages),
                }
              : {}),
          },
        },
      },
    };
  }),
});

const isEmptyThreadExport = (snapshot: ThreadExport) => {
  const messages = (snapshot as { messages?: unknown }).messages;
  return Array.isArray(messages) && messages.length === 0;
};

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

    const nextSignature = JSON.stringify(toComparableSnapshot(activeSessionSnapshot));
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
        const runtimeSnapshot = runtime.threads.main.export();
        const runtimeSignature = JSON.stringify(
          toComparableSnapshot(toPersistedSnapshot(runtimeSnapshot)),
        );
        const switchingSessions = importedSessionIdRef.current !== activeSessionId;
        if (runActiveRef.current && !switchingSessions) {
          scheduleImportRetry();
          return;
        }
        const safeToHydrate =
          switchingSessions ||
          runtimeSignature === lastSavedSignatureRef.current ||
          isEmptyThreadExport(runtimeSnapshot);

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

        const externalState = toExternalStateSnapshot(activeSessionSnapshot);
        if (externalState) {
          runtime.threads.main.importExternalState(externalState);
        } else {
          runtime.threads.main.import(toRuntimeSnapshot(activeSessionSnapshot));
        }

        const importedSignature = JSON.stringify(
          toComparableSnapshot(toPersistedSnapshot(runtime.threads.main.export())),
        );
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
      const snapshot = thread.export();
      const persistedSnapshot = toPersistedSnapshot(snapshot);
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));
      if (
        !allowEmptyOverride &&
        isEmptyThreadExport(snapshot) &&
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
      }),
    );
    unsubscribes.push(
      thread.unstable_on("runEnd", () => {
        runActiveRef.current = false;
        if (pendingForcePersistResolversRef.current.length === 0) {
          return;
        }
        void flush().finally(resolvePendingForcePersists);
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
