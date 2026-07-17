"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import { ArrowUpRight, Unplug } from "lucide-react";
import React from "react";
import { useThreadRepoItems, type ThreadRepoItem } from "@/components/assistant-ui/use-thread-repo-items";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useSessionUiState } from "@/components/context/session-ui-state";
import { getDetachedFromMessageId } from "@/lib/thread-node-deletion";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractMessageText = (message: ThreadRepoItem["message"]) => {
  if (!message) return "";
  const messageRecord = message as unknown as Record<string, unknown>;
  const content = Array.isArray(messageRecord.content) ? messageRecord.content : [];
  const contentText = content
    .flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n")
    .trim();
  if (contentText) return contentText;

  const parts = Array.isArray(messageRecord.parts) ? messageRecord.parts : [];
  return parts
    .flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n")
    .trim();
};

type DetachedDisplayItem = {
  depth: number;
  detachedFromId: string | null;
  item: ThreadRepoItem;
};

export function DetachedMessages() {
  const runtime = useAssistantRuntime();
  const { activeSession, activeSessionId } = usePersistedSessions();
  const { items } = useThreadRepoItems(runtime, {
    persistedSnapshot: activeSession?.snapshot ?? null,
    sessionKey: activeSessionId,
  });
  const {
    setCanvasSelectionId,
    setFocusedMessageId,
    setViewMode,
  } = useSessionUiState();

  const detachedItems = React.useMemo<DetachedDisplayItem[]>(() => {
    const itemById = new Map(
      items.flatMap((item) =>
        item.message?.id ? [[item.message.id, item] as const] : [],
      ),
    );
    const childrenByParent = new Map<string, ThreadRepoItem[]>();
    items.forEach((item) => {
      if (!item.parentId || !item.message?.id) return;
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    });

    const roots = items.filter(
      (item) =>
        item.parentId === null &&
        item.message?.id &&
        getDetachedFromMessageId(item.message),
    );
    const result: DetachedDisplayItem[] = [];
    const visited = new Set<string>();
    const visit = (
      item: ThreadRepoItem,
      depth: number,
      detachedFromId: string | null,
    ) => {
      const id = item.message?.id;
      if (!id || visited.has(id)) return;
      visited.add(id);
      result.push({ depth, detachedFromId, item });
      const children = childrenByParent.get(id) ?? [];
      children.forEach((child) => visit(child, depth + 1, detachedFromId));
    };

    roots.forEach((root) => {
      const detachedFromId = getDetachedFromMessageId(root.message);
      if (!root.message?.id || !itemById.has(root.message.id)) return;
      visit(root, 0, detachedFromId);
    });
    return result;
  }, [items]);

  if (detachedItems.length === 0) return null;

  return (
    <aside
      aria-label="Detached messages"
      data-testid="detached-messages-panel"
      className="flex h-full w-[19rem] max-w-[42%] shrink-0 flex-col overflow-hidden border-l border-orange-500/20 bg-background/95 shadow-[-18px_0_36px_-30px_rgba(15,23,42,0.45)] backdrop-blur-sm"
    >
      <div className="shrink-0 border-b border-orange-500/15 px-4 py-4">
        <div className="flex items-center gap-2">
          <Unplug className="h-4 w-4 text-orange-600 dark:text-orange-300" />
          <h2 className="text-sm font-semibold text-foreground">Detached messages</h2>
          <span className="rounded-full border border-orange-500/25 bg-background px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-300">
            {detachedItems.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Preserved message branches that are no longer part of the active chat flow.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-3">
        {detachedItems.map(({ depth, detachedFromId, item }) => {
          const id = item.message?.id;
          if (!id) return null;
          const role = item.message?.role === "assistant" ? "Assistant" : "User";
          const text = extractMessageText(item.message) || "No text content";
          const indent = Math.min(depth, 4) * 10;
          return (
            <button
              key={id}
              type="button"
              className="group flex w-full items-start justify-between gap-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 text-left transition hover:border-orange-500/35 hover:bg-background"
              style={{
                marginLeft: `${indent}px`,
                width: `calc(100% - ${indent}px)`,
              }}
              onClick={() => {
                setFocusedMessageId(id);
                setCanvasSelectionId(id);
                setViewMode("split");
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{role}</span>
                  {depth === 0 && detachedFromId ? (
                    <span className="rounded-full border border-orange-500/25 px-1.5 py-0.5 normal-case tracking-normal text-orange-700 dark:text-orange-300">
                      from {detachedFromId.slice(0, 8)}
                    </span>
                  ) : (
                    <span>detached branch</span>
                  )}
                </span>
                <span className="mt-1 line-clamp-5 block whitespace-pre-wrap break-words text-sm leading-5 text-foreground/90">
                  {text}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition group-hover:text-foreground">
                Canvas <ArrowUpRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
