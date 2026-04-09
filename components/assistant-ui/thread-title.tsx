"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssistantRuntime } from "@assistant-ui/react";
import { useLlmSettings } from "@/components/context/llm-settings";
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
  const { isReady: llmSettingsReady } = useLlmSettings();
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
    if (!llmSettingsReady || !activeSession || loadingRef.current) return;
    if (activeSession.title && activeSession.title.trim().length > 0) return;
    if (messages.length === 0) return;

    let isActive = true;
    loadingRef.current = true;

    (async () => {
      try {
        const slice = messages.slice(-6);
        const response = await fetch("/api/title", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
  }, [activeSession, llmSettingsReady, messages, modelId, provider, renameSession]);

  const text = formatTitle(activeSession?.title, fallback);

  if (variant === "header") {
    return <span className="font-medium">{text}</span>;
  }
  return <>{text}</>;
}

export function ThreadTitleEditor() {
  const { activeSession, renameSession } = usePersistedSessions();
  const fallback = "New Chat";
  const [draftTitle, setDraftTitle] = useState(activeSession?.title ?? "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setDraftTitle(activeSession?.title ?? "");
  }, [activeSession?.id, activeSession?.title, isEditing]);

  const commitRename = useCallback(async () => {
    if (!activeSession) return;
    const nextTitle = draftTitle.trim();
    const currentTitle = activeSession.title?.trim() ?? "";
    const normalizedTitle = nextTitle.length > 0 ? nextTitle : null;
    if ((normalizedTitle ?? "") === currentTitle) {
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    try {
      await renameSession(activeSession.id, normalizedTitle);
    } catch {
      setDraftTitle(activeSession.title ?? "");
    }
  }, [activeSession, draftTitle, renameSession]);

  const resetRename = useCallback(() => {
    setDraftTitle(activeSession?.title ?? "");
    setIsEditing(false);
  }, [activeSession?.title]);

  return (
    <input
      type="text"
      aria-label="Session title"
      value={draftTitle}
      placeholder={fallback}
      disabled={!activeSession}
      onChange={(event) => setDraftTitle(event.currentTarget.value)}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        void commitRename();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commitRename();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          resetRename();
          event.currentTarget.blur();
        }
      }}
      className="min-w-[12rem] max-w-[34rem] rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition hover:border-border/60 focus:border-ring focus:bg-background focus:shadow-sm disabled:cursor-default disabled:opacity-70"
    />
  );
}

