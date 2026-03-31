import { useEffect, useMemo, useRef, useState } from "react";
import type { AssistantRuntime } from "@assistant-ui/react";
import {
  EDIT_PARENT_KEY,
  EDIT_SOURCE_KEY,
  ASSISTANT_EDIT_METADATA_KEY,
  ASSISTANT_EDIT_BRIDGE_KEY,
} from "@/lib/assistant-edit-branching";
import { getModelEntry, rememberModelEntry, type ModelEntry } from "@/lib/message-model-registry";

type ThreadRuntimeEventType = "initialize" | "runStart" | "runEnd" | "modelContextUpdate";
type ThreadExport = ReturnType<AssistantRuntime["threads"]["main"]["export"]>;

export type ThreadRepoItem = ThreadExport["messages"][number];

type Options = {
  enabled?: boolean;
  defaultModel?: { modelId: string; provider: string };
};

const THREAD_EVENTS: ThreadRuntimeEventType[] = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
];

const providerFromValue = (value: unknown): ModelEntry["provider"] => {
  if (value === "ollama" || value === "openrouter") return value;
  return typeof value === "string" && value.length ? value : "openrouter";
};

const coalesceModelEntry = (
  item: ThreadRepoItem,
  fallback?: { modelId: string; provider: string },
): ModelEntry | undefined => {
  const custom = (item.message.metadata?.custom as Record<string, unknown> | undefined) ?? {};
  const model = typeof custom.model === "string" ? custom.model : fallback?.modelId;
  const provider = providerFromValue(custom.provider ?? fallback?.provider);
  if (!model) return undefined;
  return { model, provider };
};

const getSourceId = (message: ThreadRepoItem["message"]): string | null => {
  if (!message) return null;
  const directSource = (message as { sourceId?: unknown }).sourceId;
  if (typeof directSource === "string") return directSource;
  const custom = (message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom;
  const metaSource = custom?.[EDIT_SOURCE_KEY];
  if (typeof metaSource === "string") return metaSource;
  const editedFrom = custom?.[ASSISTANT_EDIT_METADATA_KEY];
  return typeof editedFrom === "string" ? editedFrom : null;
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
  const desiredParentId = bridgeId ?? explicitParent ?? item.parentId ?? normalizedParentId ?? null;
  if (
    desiredParentId === item.parentId &&
    (!sourceId || itemCustom[ASSISTANT_EDIT_METADATA_KEY] === sourceId) &&
    itemCustom[ASSISTANT_EDIT_BRIDGE_KEY] === bridgeId
  ) {
    return item;
  }
  const nextMetadataCustom: Record<string, unknown> = {
    ...((item.message.metadata?.custom as Record<string, unknown> | undefined) ?? {}),
  };
  if (bridgeId) {
    nextMetadataCustom[ASSISTANT_EDIT_BRIDGE_KEY] = bridgeId;
  }
  if (sourceId) {
    nextMetadataCustom[ASSISTANT_EDIT_METADATA_KEY] = sourceId;
  }
  const message = {
    ...item.message,
    metadata: {
      ...(item.message.metadata ?? {}),
      custom: nextMetadataCustom,
    },
  } as ThreadRepoItem["message"];
  return {
    parentId: desiredParentId,
    message,
  };
};

export type NormalizedThreadRepo = {
  items: ThreadRepoItem[];
  order: Map<string, number>;
  bridges: Set<string>;
};

export const normalizeThreadRepoItems = (
  items: ThreadRepoItem[],
): NormalizedThreadRepo => {
  if (items.length === 0) {
    return { items, order: new Map(), bridges: new Set() };
  }
  const byId = new Map<string, ThreadRepoItem>();
  items.forEach((item) => {
    const id = item.message?.id;
    if (id) {
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
    const originalCustom =
      (item.message.metadata as { custom?: Record<string, unknown> } | undefined)?.custom ?? {};
    const forcedBridgeIdValue = originalCustom[ASSISTANT_EDIT_BRIDGE_KEY];
    const forcedBridgeId = typeof forcedBridgeIdValue === "string" ? forcedBridgeIdValue : null;
    const currentItem =
      forcedBridgeId && forcedBridgeId !== item.parentId
        ? {
            ...item,
            parentId: forcedBridgeId,
          }
        : item;
    const id = currentItem.message?.id;
    if (id) {
      order.set(id, idx);
    }
    if (id && bridgeIds.has(id)) {
      bridges.add(id);
      acc.push(currentItem);
      return acc;
    }
    const currentParentId = currentItem.parentId ?? null;
    if (currentParentId && bridgeIds.has(currentParentId)) {
      const bridge = byId.get(currentParentId);
      acc.push(reparentAssistantChild(currentItem, bridge, byId));
      return acc;
    }
    const itemSourceId = getSourceId(currentItem.message);
    if (itemSourceId) {
      const candidates = bridgeBySource.get(itemSourceId);
      const matchedBridgeId = candidates?.[candidates.length - 1];
      if (matchedBridgeId && matchedBridgeId !== id) {
        const matchedBridge = byId.get(matchedBridgeId);
        if (matchedBridge) {
          bridges.add(matchedBridgeId);
          acc.push(reparentAssistantChild(currentItem, matchedBridge, byId));
          return acc;
        }
      }
    }
    acc.push(currentItem);
    return acc;
  }, []);
  return { items: visible, order, bridges };
};

export function useThreadRepoItems(
  runtime: AssistantRuntime | null | undefined,
  options: Options = {},
): NormalizedThreadRepo {
  const { enabled = true, defaultModel } = options;
  const defaultModelId = defaultModel?.modelId;
  const defaultProvider = defaultModel?.provider;
  const [items, setItems] = useState<ThreadRepoItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

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
        const rawItems = Array.isArray(exportValue?.messages) ? exportValue.messages : [];

        // Record model/provider once per message (without mutating message data).
        rawItems.forEach((item) => {
          const id = item.message?.id;
          if (!id) return;
          if (seenIdsRef.current.has(id)) return;
          seenIdsRef.current.add(id);
          const existing = getModelEntry(id);
          if (existing) return;
          const derived = coalesceModelEntry(
            item,
            defaultModelId && defaultProvider
              ? { modelId: defaultModelId, provider: defaultProvider }
              : undefined,
          );
          if (derived) {
            rememberModelEntry(id, derived);
          }
        });

        setItems(rawItems);
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
  }, [enabled, runtime, defaultModelId, defaultProvider]);
  return useMemo(() => normalizeThreadRepoItems(items), [items]);
}
