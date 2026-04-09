"use client";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useModelConfig } from "@/components/context/model-config";
import { Bot, Power } from "lucide-react";
import React from "react";
import { getProviderLabel } from "@/lib/llm/provider-catalog";

export function LlmToggleButton() {
  const { llmEnabled, setLlmEnabled } = useLlmEnabled();
  const { provider, modelId } = useModelConfig();
  const tooltip = llmEnabled ? "Disable AI requests" : "Enable AI requests";
  const detail =
    provider === "openrouter" ? "OpenRouter" : `${getProviderLabel(provider)} (${modelId})`;

  return (
    <TooltipIconButton
      tooltip={`${tooltip} · ${detail}`}
      aria-pressed={llmEnabled}
      aria-label={`${tooltip} (${detail})`}
      onClick={() => setLlmEnabled(!llmEnabled)}
      variant={llmEnabled ? "default" : "outline"}
      className="size-8 p-2"
    >
      {llmEnabled ? <Bot className="h-4 w-4" /> : <Power className="h-4 w-4" />}
    </TooltipIconButton>
  );
}
