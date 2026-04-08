import type { ModelConfig } from "@/components/context/model-config";

export type ModelOption = ModelConfig & { label: string };

export const SAFE_DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelId: "nvidia/nemotron-3-super-120b-a12b:free",
  provider: "openrouter",
};

export const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "OpenRouter · Nemotron 3 Super (free)",
    modelId: SAFE_DEFAULT_MODEL_CONFIG.modelId,
    provider: SAFE_DEFAULT_MODEL_CONFIG.provider,
  },
  {
    label: "OpenRouter · Free Router",
    modelId: "openrouter/free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Nemotron 3 Nano",
    modelId: "nvidia/nemotron-3-nano-30b-a3b:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Trinity Large Preview",
    modelId: "arcee-ai/trinity-large-preview:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Trinity Mini",
    modelId: "arcee-ai/trinity-mini:free",
    provider: "openrouter",
  },
  { label: "Ollama · gemma3:4b (local optional)", modelId: "gemma3:4b", provider: "ollama" },
];

export function getModelOptionKey(option: Pick<ModelOption, "modelId" | "provider">) {
  return `${option.provider}:${option.modelId}`;
}

export function isSupportedModelConfig(config: ModelConfig) {
  return MODEL_OPTIONS.some(
    (option) => option.modelId === config.modelId && option.provider === config.provider,
  );
}

export function findModelOption(config: ModelConfig) {
  return (
    MODEL_OPTIONS.find(
      (option) => option.modelId === config.modelId && option.provider === config.provider,
    ) ?? MODEL_OPTIONS[0]
  );
}

export function getSupportedModelConfig(config?: Partial<ModelConfig> | null): ModelConfig {
  if (
    config &&
    typeof config.modelId === "string" &&
    (config.provider === "ollama" || config.provider === "openrouter")
  ) {
    const candidate: ModelConfig = {
      modelId: config.modelId,
      provider: config.provider,
    };
    if (isSupportedModelConfig(candidate)) {
      return candidate;
    }
  }

  return SAFE_DEFAULT_MODEL_CONFIG;
}
