"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import { ArrowUpRight, ChevronLeft, Unplug, X } from "lucide-react";
import React from "react";
import {
  useThreadRepoItems,
  type ThreadRepoItem,
} from "@/components/assistant-ui/use-thread-repo-items";
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
  const [isOpen, setIsOpen] = React.useState(false);

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

  React.useEffect(() => {
    setIsOpen(false);
  }, [activeSessionId]);

  React.useEffect(() => {
    if (detachedItems.length === 0) setIsOpen(false);
  }, [detachedItems.length]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (detachedItems.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      data-testid="detached-messages-layer"
    >
      {!isOpen ? (
        <button
          type="button"
          aria-controls="detached-messages-drawer"
          aria-expanded="false"
          aria-label={`Open ${detachedItems.length} detached messages`}
          title="Open detached messages"
          className="pointer-events-auto absolute right-0 top-1/2 flex h-28 w-11 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 border-orange-500/25 bg-background/95 text-orange-700 shadow-[-10px_0_24px_-18px_rgba(15,23,42,0.55)] backdrop-blur-md transition hover:w-12 hover:bg-background dark:text-orange-300"
          onClick={() => setIsOpen(true)}
        >
          <ChevronLeft className="h-4 w-4" />
          <Unplug className="h-4 w-4" />
          <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold">
            {detachedItems.length}
          </span>
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label="Close detached messages"
            className="pointer-events-auto absolute inset-0 bg-slate-950/10 backdrop-blur-[1px]"
            onClick={() => setIsOpen(false)}
          />

          <aside
            id="detached-messages-drawer"
            aria-label="Detached messages"
            data-testid="detached-messages-panel"
            className="pointer-events-auto absolute inset-y-0 right-0 flex w-[20rem] max-w-[calc(100%-3rem)] flex-col overflow-hidden border-l border-orange-500/20 bg-background/98 shadow-[-24px_0_48px_-28px_rgba(15,23,42,0.65)] backdrop-blur-md"
          >
            <div className="shrink-0 border-b border-orange-500/15 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Unplug className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" />
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      Detached messages
                    </h2>
                    <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-300">
                      {detachedItems.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Preserved branches outside the active chat flow.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close detached messages"
                  title="Close detached messages"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-3">
              {detachedItems.map(({ depth, detachedFromId, item }) => {
                const id = item.message?.id;
                if (!id) return null;
                const role =
                  item.message?.role === "assistant" ? "Assistant" : "User";
                const text = extractMessageText(item.message) || "No text content";
                return (
                  <button
                    key={id}
                    type="button"
                    className="group flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 text-left transition hover:border-orange-500/35 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35"
                    onClick={() => {
                      setFocusedMessageId(id);
                      setCanvasSelectionId(id);
                      setViewMode("split");
                      setIsOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        <span className="shrink-0">{role}</span>
                        <span className="truncate rounded-full border border-orange-500/20 px-1.5 py-0.5 normal-case tracking-normal text-orange-700 dark:text-orange-300">
                          {depth === 0 && detachedFromId
                            ? `from ${detachedFromId.slice(0, 8)}`
                            : `branch ${Math.max(depth, 1)}`}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-4 block whitespace-pre-wrap break-words text-sm leading-5 text-foreground/90 [overflow-wrap:anywhere]">
                        {text}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition group-hover:text-foreground"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
