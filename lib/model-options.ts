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
    label: "OpenRouter · Step 3.5 Flash (free)",
    modelId: "stepfun/step-3.5-flash:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Qwen 3.6 Plus (free)",
    modelId: "qwen/qwen3.6-plus:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Hermes 3 405B (free)",
    modelId: "nousresearch/hermes-3-llama-3.1-405b:free",
    provider: "openrouter",
  },
  {
    label: "OpenRouter · Llama 3.3 70B (free)",
    modelId: "meta-llama/llama-3.3-70b-instruct:free",
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
