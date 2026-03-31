"use client";

import React from "react";
import { useModelConfig } from "@/components/context/model-config";
import { MODEL_OPTIONS, findModelOption, getModelOptionKey } from "@/lib/model-options";

export function ModelSelector() {
  const { modelId, provider, setModelConfig } = useModelConfig();
  const selectedKey = getModelOptionKey(findModelOption({ modelId, provider }));

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      Model
      <select
        className="text-foreground bg-muted/70 hover:bg-muted focus-visible:ring-ring flex min-w-48 items-center rounded-md border px-2 py-1 text-xs outline-none transition-colors"
        value={selectedKey}
        onChange={(e) => {
          const option = MODEL_OPTIONS.find((opt) => getModelOptionKey(opt) === e.target.value);
          if (!option) return;
          setModelConfig({ modelId: option.modelId, provider: option.provider });
        }}
      >
        {MODEL_OPTIONS.map((opt) => (
          <option key={getModelOptionKey(opt)} value={getModelOptionKey(opt)}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
