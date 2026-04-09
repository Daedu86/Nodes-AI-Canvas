"use client";

import React from "react";
import { useLlmSettings } from "@/components/context/llm-settings";
import { useModelConfig } from "@/components/context/model-config";
import { findModelOption, getModelOptionKey } from "@/lib/model-options";

export function ModelSelector() {
  const { modelId, provider, setModelConfig } = useModelConfig();
  const { availableModelOptions, getSupportedModelConfig } = useLlmSettings();
  const selectedOption = findModelOption(
    getSupportedModelConfig({ modelId, provider }),
    availableModelOptions,
  );
  const selectedKey = getModelOptionKey(selectedOption);

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      Model
      <select
        className="text-foreground bg-muted/70 hover:bg-muted focus-visible:ring-ring flex min-w-48 items-center rounded-md border px-2 py-1 text-xs outline-none transition-colors"
        value={selectedKey}
        onChange={(e) => {
          const option = availableModelOptions.find(
            (opt) => getModelOptionKey(opt) === e.target.value,
          );
          if (!option) return;
          setModelConfig({ modelId: option.modelId, provider: option.provider });
        }}
      >
        {availableModelOptions.map((opt) => (
          <option key={getModelOptionKey(opt)} value={getModelOptionKey(opt)}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
