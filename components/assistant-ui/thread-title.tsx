"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import { PencilIcon } from "lucide-react";
import { useModelConfig } from "@/components/context/model-config";
import { usePersistedSessions } from "@/components/context/persisted-sessions";

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

const formatTitle = (title: string | null | undefined, fallback: string) =>
  typeof title === "string" && title.trim().length ? title.trim() : fallback;

export function ThreadTitle({ variant = "inline", fallback = "New Chat" }: Props) {
  const runtime = useAssistantRuntime();
  const { activeSession, renameSession } = usePersistedSessions();
  const { modelId, provider } = useModelConfig();
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
    if (!activeSession || loadingRef.current) return;
    if (activeSession.title && activeSession.title.trim().length > 0) return;
    if (messages.length === 0) return;

    let isActive = true;
    loadingRef.current = true;

    (async () => {
      try {
        const slice = messages.slice(-6);
        const response = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: slice, model: modelId, provider }),
        });
        const data: TitleResponse = response.ok ? await response.json() : { title: null };
        if (!isActive || !data.title) return;
        await renameSession(activeSession.id, data.title);
      } catch {
        // ignore
      } finally {
        loadingRef.current = false;
      }
    })();

    return () => {
      isActive = false;
    };
  }, [activeSession, messages, modelId, provider, renameSession]);

  const text = formatTitle(activeSession?.title, fallback);

  if (variant === "header") {
    return <span className="font-medium">{text}</span>;
  }
  return <>{text}</>;
}

export function ThreadTitleEditor() {
  const { activeSession, renameSession } = usePersistedSessions();
  const title = formatTitle(activeSession?.title, "New Chat");

  const handleRename = () => {
    if (typeof window === "undefined" || !activeSession) return;
    const next = window.prompt("Rename session", activeSession.title ?? "") ?? null;
    if (next === null) return;
    void renameSession(activeSession.id, next.trim().length ? next.trim() : null);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium">{title}</span>
      <button
        type="button"
        title="Rename session"
        onClick={handleRename}
        className="text-muted-foreground hover:text-foreground inline-flex items-center rounded p-0.5"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </span>
  );
}

