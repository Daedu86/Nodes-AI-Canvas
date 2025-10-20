"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAssistantRuntime, useThreadListItem } from "@assistant-ui/react";
import { PencilIcon } from "lucide-react";

const THREAD_TITLE_EVENT = "threadTitleChanged";

type ThreadTitleEventDetail = {
  threadId?: string;
  title?: string | null;
};

type ThreadMessageLike = {
  id?: string;
  role?: string;
  content?: unknown;
};

type TitleResponse = {
  title?: string | null;
};

type Props = {
  variant?: "inline" | "header";
  fallback?: string;
};

const storageKey = (threadId: string) => `threadTitle:${threadId}`;

export function ThreadTitle({ variant = "inline", fallback = "New Chat" }: Props) {
  const runtime = useAssistantRuntime();
  const threadItem = useThreadListItem({ optional: true });
  const threadId = threadItem?.id ?? "__DEFAULT_ID__";
  const [manualTitle, setManualTitle] = useState<string | null>(null);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const messages = useMemo<ThreadMessageLike[]>(() => {
    const main = runtime?.threads?.main;
    if (!main) return [];
    try {
      const state = main.getState();
      const list = Array.isArray(state?.messages) ? state.messages : [];
      return list as ThreadMessageLike[];
    } catch {
      return [];
    }
  }, [runtime]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey(threadId));
      setManualTitle(saved && saved.length ? saved : null);
    } catch {
      setManualTitle(null);
    }

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ThreadTitleEventDetail>).detail;
      if (detail?.threadId === threadId) {
        setManualTitle(detail.title ?? null);
      }
    };

    window.addEventListener(THREAD_TITLE_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(THREAD_TITLE_EVENT, onChanged as EventListener);
  }, [threadId]);

  useEffect(() => {
    if (!runtime || loadingRef.current) return;
    if (messages.length === 0) return;
    if ((manualTitle && manualTitle.length > 0) || (generatedTitle && generatedTitle.length > 0)) return;

    let isActive = true;
    loadingRef.current = true;

    (async () => {
      try {
        const slice = messages.slice(-6);
        const response = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: slice }),
        });
        const data: TitleResponse = response.ok ? await response.json() : { title: null };
        if (!isActive) return;
        if (data.title) {
          setGeneratedTitle(data.title);
        }
      } catch {
        // ignore
      } finally {
        loadingRef.current = false;
      }
    })();

    return () => {
      isActive = false;
    };
  }, [runtime, messages, manualTitle, generatedTitle]);

  const text = manualTitle ?? generatedTitle ?? threadItem?.title ?? fallback;

  if (variant === "header") {
    return <span className="font-medium">{text}</span>;
  }
  return <>{text}</>;
}

export function ThreadTitleEditor() {
  const threadItem = useThreadListItem({ optional: true });
  const threadId = threadItem?.id ?? "__DEFAULT_ID__";
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      try {
        const saved = localStorage.getItem(storageKey(threadId));
        setCurrentTitle(saved && saved.length ? saved : null);
      } catch {
        setCurrentTitle(null);
      }
    };

    read();
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ThreadTitleEventDetail>).detail;
      if (detail?.threadId === threadId) {
        setCurrentTitle(detail.title ?? null);
      }
    };
    window.addEventListener(THREAD_TITLE_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(THREAD_TITLE_EVENT, onChanged as EventListener);
  }, [threadId]);

  const handleRename = () => {
    if (typeof window === "undefined") return;
    const existing = currentTitle ?? "";
    const next = window.prompt("Rename thread", existing) ?? null;
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      try {
        localStorage.removeItem(storageKey(threadId));
      } catch {}
    } else {
      try {
        localStorage.setItem(storageKey(threadId), trimmed);
      } catch {}
    }
    try {
      window.dispatchEvent(
        new CustomEvent<ThreadTitleEventDetail>(THREAD_TITLE_EVENT, {
          detail: { threadId, title: trimmed.length === 0 ? null : trimmed },
        }),
      );
    } catch {}
    setCurrentTitle(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <ThreadTitle variant="header" />
      <button
        type="button"
        title="Rename thread"
        onClick={handleRename}
        className="text-muted-foreground hover:text-foreground inline-flex items-center rounded p-0.5"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </span>
  );
}
