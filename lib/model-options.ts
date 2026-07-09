import type { ModelConfig } from "@/components/context/model-config";
import {
  createProviderModelLabel,
  OPENROUTER_FREE_MODEL_OPTIONS,
  SAFE_DEFAULT_MODEL,
  type LlmProviderId,
} from "@/lib/llm/provider-catalog";

export type ModelOption = ModelConfig & { label: string };

export const SAFE_DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelId: SAFE_DEFAULT_MODEL.modelId,
  provider: SAFE_DEFAULT_MODEL.provider,
};

export const BUILTIN_MODEL_OPTIONS: ModelOption[] = [
  ...OPENROUTER_FREE_MODEL_OPTIONS,
];

export const MODEL_OPTIONS = BUILTIN_MODEL_OPTIONS;

export function createDynamicModelOptions(
  provider: LlmProviderId,
  modelIds: string[],
): ModelOption[] {
  return modelIds.map((modelId) => ({
    label: createProviderModelLabel(provider, modelId),
    modelId,
    provider,
  }));
}

export function dedupeModelOptions(options: ModelOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.provider}:${option.modelId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getModelOptionKey(option: Pick<ModelOption, "modelId" | "provider">) {
  return `${option.provider}:${option.modelId}`;
}

export function isSupportedModelConfig(
  config: ModelConfig,
  options: ModelOption[] = MODEL_OPTIONS,
) {
  return options.some(
    (option) => option.modelId === config.modelId && option.provider === config.provider,
  );
}

export function findModelOption(
  config: ModelConfig,
  options: ModelOption[] = MODEL_OPTIONS,
) {
  return (
    options.find(
      (option) => option.modelId === config.modelId && option.provider === config.provider,
    ) ?? options[0]
  );
}

export function getSupportedModelConfig(
  config?: Partial<ModelConfig> | null,
  options: ModelOption[] = MODEL_OPTIONS,
): ModelConfig {
  if (
    config &&
    typeof config.modelId === "string" &&
    typeof config.provider === "string"
  ) {
    const candidate: ModelConfig = {
      modelId: config.modelId,
      provider: config.provider as ModelConfig["provider"],
    };
    if (isSupportedModelConfig(candidate, options)) {
      return candidate;
    }
  }

  const fallback = options[0] ?? SAFE_DEFAULT_MODEL_CONFIG;
  return {
    modelId: fallback.modelId,
    provider: fallback.provider,
  };
}

export function getProviderModelIds(
  provider: LlmProviderId,
  options: ModelOption[],
) {
  return options
    .filter((option) => option.provider === provider)
    .map((option) => option.modelId);
}
