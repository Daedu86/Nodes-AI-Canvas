"use client";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { Bot, Power } from "lucide-react";
import React from "react";

export function LlmToggleButton() {
  const { llmEnabled, setLlmEnabled } = useLlmEnabled();
  const [pending, setPending] = React.useState(false);
  const tooltip = pending ? (llmEnabled ? "Stopping..." : "Starting...") : (llmEnabled ? "Disable LLM" : "Enable LLM");

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    const next = !llmEnabled;
    try {
      const res = await fetch("/api/llm/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: next ? "start" : "stop", model: "gemma3:4b" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      const errorMessage = data?.error ?? res.statusText;
      if (!res.ok || data?.ok === false) {
        console.error("LLM toggle failed:", errorMessage);
        alert(`LLM ${next ? "start" : "stop"} failed: ${errorMessage}`);
        return;
      }
      setLlmEnabled(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
      console.error(error);
      alert(`LLM ${next ? "start" : "stop"} failed: ${message}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <TooltipIconButton
      tooltip={tooltip}
      aria-pressed={llmEnabled}
      aria-label={tooltip}
      onClick={toggle}
      disabled={pending}
      variant={llmEnabled ? "default" : "outline"}
      className="size-8 p-2"
    >
      {llmEnabled ? <Bot className="h-4 w-4" /> : <Power className="h-4 w-4" />}
    </TooltipIconButton>
  );
}
