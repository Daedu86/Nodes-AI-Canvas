import { useEffect, useMemo, useState } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";
import type { ThreadRuntimeEventType } from "@assistant-ui/react/runtimes/core/ThreadRuntimeCore";
import type { ExportedMessageRepository } from "@assistant-ui/react/runtimes/utils/MessageRepository";
import {
  EDIT_PARENT_KEY,
  EDIT_SOURCE_KEY,
  ASSISTANT_EDIT_METADATA_KEY,
} from "@/lib/assistant-edit-branching";

export type ThreadRepoItem = ExportedMessageRepository["messages"][number];

type Options = {
  enabled?: boolean;
};

const THREAD_EVENTS: ThreadRuntimeEventType[] = [
  "initialize",
  "run-start",
  "run-end",
  "model-context-update",
];

const getSourceId = (message: ThreadRepoItem["message"]): string | null => {
  if (!message) return null;
  const directSource = (message as { sourceId?: unknown }).sourceId;
  if (typeof directSource === "string") return directSource;
  const custom = (message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom;
  const metaSource = custom?.[EDIT_SOURCE_KEY];
  return typeof metaSource === "string" ? metaSource : null;
};

const shouldHideUserBridge = (item: ThreadRepoItem, byId: Map<string, ThreadRepoItem>) => {
  const message = item.message;
  if (!message || message.role !== "user") return false;
  const sourceId = getSourceId(message);
  if (!sourceId) return false;
  const source = byId.get(sourceId)?.message;
  return source?.role === "assistant";
};

const reparentAssistantChild = (
  item: ThreadRepoItem,
  bridge: ThreadRepoItem | undefined,
  byId: Map<string, ThreadRepoItem>,
): ThreadRepoItem => {
  if (!bridge) return item;
  const bridgeCustom = (bridge.message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom ?? {};
  const explicitSource =
    typeof bridgeCustom[EDIT_SOURCE_KEY] === "string" ? (bridgeCustom[EDIT_SOURCE_KEY] as string) : null;
  const detectedSourceId = explicitSource ?? getSourceId(bridge.message);
  const sourceParentId = detectedSourceId ? byId.get(detectedSourceId)?.parentId ?? null : null;
  const explicitParent = (bridgeCustom[EDIT_PARENT_KEY] as string | null | undefined) ?? null;
  const normalizedParentId = explicitParent ?? bridge.parentId ?? sourceParentId ?? null;
  const sourceId = detectedSourceId;
  const itemCustom = (item.message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom ?? {};
  const bridgeId = bridge.message?.id;
  const desiredParentId = explicitParent ?? bridgeId ?? item.parentId ?? normalizedParentId ?? null;
  if (desiredParentId === item.parentId && (!sourceId || itemCustom[ASSISTANT_EDIT_METADATA_KEY] === sourceId)) {
    return item;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("[thread-repo] reparent assistant", {
      childId: item.message?.id,
      originalParentId: item.parentId ?? null,
      normalizedParentId: desiredParentId,
      sourceId,
      bridgeCustom,
      bridgeSourceId: getSourceId(bridge.message),
      bridgeParentId: bridge.parentId ?? null,
    });
  }
  const message =
    sourceId
      ? {
          ...item.message,
          metadata: {
            ...(item.message.metadata ?? {}),
            custom: {
              ...((item.message.metadata?.custom as Record<string, unknown> | undefined) ?? {}),
              [ASSISTANT_EDIT_METADATA_KEY]: sourceId,
            },
          },
        }
      : item.message;
  if (process.env.NODE_ENV !== "production" && sourceId) {
    console.log("[thread-repo] tagged assistant edit metadata", {
      childId: message?.id,
      editedFromId: sourceId,
    });
  }
  return {
    parentId: desiredParentId,
    message,
  };
};

const normalizeAssistantBranches = (
  items: ThreadRepoItem[],
): { items: ThreadRepoItem[]; order: Map<string, number>; bridges: Set<string> } => {
  if (items.length === 0) {
    return { items, order: new Map(), bridges: new Set() };
  }
  const byId = new Map<string, ThreadRepoItem>();
  items.forEach((item) => {
    const id = item.message?.id;
    if (id) {
      if (process.env.NODE_ENV !== "production" && item.message?.role === "user") {
        const custom = (item.message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom;
        console.log("[thread-repo] user metadata", {
          id,
          parentId: item.parentId ?? null,
          hasEditSource: typeof custom?.[EDIT_SOURCE_KEY] === "string",
          sourceId: getSourceId(item.message),
          custom,
        });
      }
      byId.set(id, item);
    }
  });
  const bridgeIds = new Set<string>();
  items.forEach((item) => {
    const id = item.message?.id;
    if (id && shouldHideUserBridge(item, byId)) {
      bridgeIds.add(id);
    }
  });
  const bridgeBySource = new Map<string, string[]>();
  bridgeIds.forEach((bridgeId) => {
    const bridge = byId.get(bridgeId);
    if (!bridge) return;
    const source = getSourceId(bridge.message);
    if (!source) return;
    const list = bridgeBySource.get(source) ?? [];
    list.push(bridgeId);
    bridgeBySource.set(source, list);
  });
  const order = new Map<string, number>();
  const bridges = new Set<string>();
  const visible = items.reduce<ThreadRepoItem[]>((acc, item, idx) => {
    const id = item.message?.id;
    if (id) {
      order.set(id, idx);
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[thread-repo] normalized candidate", {
        id,
        parentId: item.parentId ?? null,
        custom: (item.message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom,
        sourceId: getSourceId(item.message),
      });
    }
    if (id && bridgeIds.has(id)) {
      bridges.add(id);
      acc.push(item);
      return acc;
    }
    const currentParentId = item.parentId ?? null;
    if (currentParentId && bridgeIds.has(currentParentId)) {
      const bridge = byId.get(currentParentId);
      acc.push(reparentAssistantChild(item, bridge, byId));
      return acc;
    }
    const itemSourceId = getSourceId(item.message);
    if (itemSourceId) {
      const candidates = bridgeBySource.get(itemSourceId);
      const matchedBridgeId = candidates?.[candidates.length - 1];
      if (matchedBridgeId && matchedBridgeId !== id) {
        const matchedBridge = byId.get(matchedBridgeId);
        if (matchedBridge) {
          bridges.add(matchedBridgeId);
          acc.push(reparentAssistantChild(item, matchedBridge, byId));
          return acc;
        }
      }
    }
    acc.push(item);
    return acc;
  }, []);
  return { items: visible, order, bridges };
};

export function useThreadRepoItems(
  runtime: AssistantRuntime | null | undefined,
  options: Options = {},
): { items: ThreadRepoItem[]; order: Map<string, number>; bridges: Set<string> } {
  const { enabled = true } = options;
  const [items, setItems] = useState<ThreadRepoItem[]>([]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }

    const thread = runtime?.threads?.main;
    if (!thread) {
      setItems([]);
      return;
    }

    let isMounted = true;
    const readExport = () => {
      if (!isMounted) return;
      try {
        const exportValue = thread.export();
        setItems(Array.isArray(exportValue?.messages) ? exportValue.messages : []);
      } catch {
        if (isMounted) setItems([]);
      }
    };

    readExport();
    const unsubscribes: Array<(() => void) | undefined> = [];
    unsubscribes.push(thread.subscribe(readExport));
    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, readExport));
    });

    return () => {
      isMounted = false;
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch {
          /* swallow */
        }
      });
    };
  }, [enabled, runtime]);

  return useMemo(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[thread-repo] raw export", items);
    }
    return normalizeAssistantBranches(items);
  }, [items]);
}
