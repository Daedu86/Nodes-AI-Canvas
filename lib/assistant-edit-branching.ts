"use client";

import { useEffect, useState } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";

export const EDIT_PARENT_KEY = "__assistantEditParentId";
export const EDIT_SOURCE_KEY = "__assistantEditSourceId";
export const ASSISTANT_EDIT_METADATA_KEY = "__assistantEditedFrom";
export const ASSISTANT_EDIT_BRIDGE_KEY = "__assistantEditBridgeId";

type ThreadExport = ReturnType<AssistantRuntime["threads"]["main"]["export"]>;

type EditBranchingOptions = {
  storageKey?: string;
};

const DEFAULT_THREAD_EXPORT_STORAGE_KEY = "assistant-ui.main-thread-export.v1";
const THREAD_EVENTS = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isThreadExport = (value: unknown): value is ThreadExport => {
  if (!isRecord(value)) return false;
  if ("headId" in value && value.headId !== null && typeof value.headId !== "string") {
    return false;
  }
  if (!Array.isArray(value.messages)) return false;
  return value.messages.every((entry) => {
    if (!isRecord(entry)) return false;
    if (entry.parentId !== null && typeof entry.parentId !== "string") return false;
    return isRecord(entry.message);
  });
};

const readPersistedThreadExport = (storageKey: string): ThreadExport | null => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isThreadExport(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const clearPersistedThreadExport = (storageKey: string) => {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage failures
  }
};

const persistThreadExport = (storageKey: string, repository: ThreadExport) => {
  try {
    if (!repository.messages.length) {
      clearPersistedThreadExport(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(repository));
  } catch {
    // ignore storage failures
  }
};

export function useAssistantEditBranching(
  runtime: AssistantRuntime | null | undefined,
  options: EditBranchingOptions = {},
) {
  const [isHydrated, setIsHydrated] = useState(false);
  const storageKey = options.storageKey ?? DEFAULT_THREAD_EXPORT_STORAGE_KEY;

  useEffect(() => {
    if (!runtime) {
      setIsHydrated(false);
      return;
    }

    setIsHydrated(false);
    const thread = runtime.threads?.main;
    if (!thread) {
      setIsHydrated(true);
      return;
    }

    const persisted = readPersistedThreadExport(storageKey);
    let restored = !persisted;
    let syncingFromStorage = false;

    const persist = () => {
      if (!restored) return;
      if (syncingFromStorage) return;
      try {
        const exported = thread.export();
        if (!exported.messages.length) {
          const snapshot = readPersistedThreadExport(storageKey);
          if (snapshot?.messages.length) {
            syncingFromStorage = true;
            try {
              thread.import(snapshot);
            } finally {
              syncingFromStorage = false;
            }
            return;
          }
          clearPersistedThreadExport(storageKey);
          return;
        }
        persistThreadExport(storageKey, exported);
      } catch {
        // ignore export failures
      }
    };

    const restore = () => {
      if (restored) {
        setIsHydrated(true);
        return;
      }
      if (!persisted) {
        restored = true;
        persist();
        setIsHydrated(true);
        return;
      }
      try {
        syncingFromStorage = true;
        thread.import(persisted);
      } catch {
        syncingFromStorage = false;
        clearPersistedThreadExport(storageKey);
        restored = true;
        setIsHydrated(true);
        return;
      }
      syncingFromStorage = false;
      restored = true;
      persist();
      setIsHydrated(true);
    };

    const unsubscribes: Array<() => void> = [thread.subscribe(persist)];
    THREAD_EVENTS.forEach((event) => {
      if (event === "initialize") {
        unsubscribes.push(thread.unstable_on(event, restore));
        return;
      }
      unsubscribes.push(thread.unstable_on(event, persist));
    });

    queueMicrotask(() => {
      if (!restored) {
        restore();
        return;
      }
      persist();
      setIsHydrated(true);
    });
    const retryTimer = window.setTimeout(() => {
      if (!restored) {
        restore();
      }
    }, 50);

    return () => {
      window.clearTimeout(retryTimer);
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup failures
        }
      });
    };
  }, [runtime, storageKey]);

  return isHydrated;
}
