"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAssistantRuntime, useThreadListItem } from "@assistant-ui/react";
import { PencilIcon } from "lucide-react";

type Props = {
  variant?: "inline" | "header";
  fallback?: string;
};

const storageKey = (threadId: string) => `threadTitle:${threadId}`;

export function ThreadTitle({ variant = "inline", fallback = "New Chat" }: Props) {
  const runtime = useAssistantRuntime();
  const threadItem = useThreadListItem({ optional: true }) as any;
  const threadId = threadItem?.id ?? "__DEFAULT_ID__";
  const [manualTitle, setManualTitle] = useState<string | null>(null);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const messages = useMemo(() => {
    const main = runtime?.threads?.main;
    if (!main) return [] as any[];
    try {
      return main.getState().messages ?? [];
    } catch {
      return [] as any[];
    }
  }, [runtime?.threads]);

  // Load manual title on thread change and listen for local updates
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey(threadId));
      setManualTitle(saved && saved.length ? saved : null);
    } catch {}

    const onChanged = (e: Event) => {
      const d = (e as any)?.detail as { threadId?: string; title?: string | null } | undefined;
      if (d && d.threadId === threadId) { setManualTitle(d.title ?? null); }
    };
    window.addEventListener("threadTitleChanged", onChanged as EventListener);
    return () => window.removeEventListener("threadTitleChanged", onChanged as EventListener);
  }, [threadId]);

  useEffect(() => {
    // Generate a title only when there's at least one message.
    if (!runtime || loadingRef.current) return;
    if (!messages || messages.length === 0) return;
    // Avoid if we already have manual or generated title
    if ((manualTitle && manualTitle.length > 0) || (generatedTitle && generatedTitle.length > 0)) return;

    let active = true;
    loadingRef.current = true;

    (async () => {
      try {
        // Send only a small slice to keep it fast.
        const slice = messages.slice(-6);
        const r = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: slice }),
        });
        const data = r.ok ? await r.json() : { title: null };
        if (!active) return;
        const t = (data?.title as string) || null;
        if (t) setGeneratedTitle(t);
      } catch (e) {
        // Ignore errors; title is best-effort
        // console.warn("/api/title failed", e);
      } finally {
        loadingRef.current = false;
      }
    })();

    return () => {
      active = false;
    };
  }, [runtime, messages, manualTitle, generatedTitle]);

  const text = manualTitle ?? generatedTitle ?? threadItem?.title ?? fallback;

  if (variant === "header") {
    return <span className="font-medium">{text}</span>;
  }
  return <>{text}</>;
}

export function ThreadTitleEditor() {
  const threadItem = useThreadListItem({ optional: true }) as any;
  const threadId = threadItem?.id ?? "__DEFAULT_ID__";
  const [tick, setTick] = useState(0);

  const current = useMemo(() => {
    if (typeof window === "undefined") return null as string | null;
    return localStorage.getItem(storageKey(threadId));
  }, [threadId, tick]);

  const handleRename = () => {
    if (typeof window === "undefined") return;
    const currentTitle = current ?? "";
    const next = window.prompt("Rename thread", currentTitle || "");
    if (next === null) return; // cancelled
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      // Clear manual title to fall back to generated
      localStorage.removeItem(storageKey(threadId));
    } else {
      localStorage.setItem(storageKey(threadId), trimmed);
    }
    // Notify listeners in this tab
    try {
      window.dispatchEvent(new CustomEvent("threadTitleChanged", { detail: { threadId, title: trimmed || null } }));
    } catch {}
    setTick((x) => x + 1);
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






