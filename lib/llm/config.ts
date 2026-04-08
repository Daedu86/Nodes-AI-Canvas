import type { LlmContextArtifact } from "@/lib/session-artifacts";

export type Provider = "ollama" | "openrouter";

export type ModelResolutionRunConfig = {
  historyMode?: string;
  custom?: {
    contextArtifacts?: LlmContextArtifact[];
    historyMode?: string;
    model?: string;
    provider?: Provider;
  };
  model?: string;
  provider?: Provider;
};

export type ModelResolutionMetadata = {
  historyMode?: string;
  custom?: {
    contextArtifacts?: LlmContextArtifact[];
    historyMode?: string;
    model?: string;
    provider?: Provider;
  };
  model?: string;
  provider?: Provider;
};

export type ModelResolutionInput = {
  model?: string;
  provider?: Provider;
  runConfig?: ModelResolutionRunConfig;
  metadata?: ModelResolutionMetadata;
};

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1";
export const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434/api";

const DEFAULT_ALLOWED_MODELS: Record<Provider, string[]> = {
  openrouter: [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "stepfun/step-3.5-flash:free",
    "qwen/qwen3.6-plus:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ],
  ollama: ["gemma3:4b"],
};

const parseAllowedModels = (value: string | undefined) =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) ?? [];

const inferProviderFromModel = (modelId: string): Provider =>
  modelId.includes("/") ? "openrouter" : "ollama";

export function getAllowedModels(provider: Provider) {
  const configured = parseAllowedModels(
    provider === "openrouter"
      ? process.env.ALLOWED_OPENROUTER_MODELS
      : process.env.ALLOWED_OLLAMA_MODELS,
  );
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_MODELS[provider];
}

export function isAllowedModelConfig(config: { modelId: string; provider: Provider }) {
  return getAllowedModels(config.provider).includes(config.modelId);
}

export function getSafeDefaultModelConfig(): {
  modelId: string;
  provider: Provider;
} {
  const defaultProvider = inferProviderFromModel(DEFAULT_MODEL);
  if (isAllowedModelConfig({ modelId: DEFAULT_MODEL, provider: defaultProvider })) {
    return { modelId: DEFAULT_MODEL, provider: defaultProvider };
  }

  const [fallbackOpenRouter] = getAllowedModels("openrouter");
  if (fallbackOpenRouter) {
    return { modelId: fallbackOpenRouter, provider: "openrouter" };
  }

  const [fallbackOllama] = getAllowedModels("ollama");
  return {
    modelId: fallbackOllama ?? DEFAULT_MODEL,
    provider: fallbackOllama ? "ollama" : defaultProvider,
  };
}

export function resolveModelConfig(input: ModelResolutionInput): {
  modelId: string;
  provider: Provider;
} {
  const model =
    input.model ??
    input.metadata?.model ??
    input.runConfig?.model ??
    input.metadata?.custom?.model ??
    input.runConfig?.custom?.model ??
    DEFAULT_MODEL;
  const provider =
    input.provider ??
    input.metadata?.provider ??
    input.runConfig?.provider ??
    input.metadata?.custom?.provider ??
    input.runConfig?.custom?.provider ??
    (model.includes("/") ? "openrouter" : "ollama");

  const candidate: {
    modelId: string;
    provider: Provider;
  } = {
    modelId: model,
    provider: provider === "openrouter" ? "openrouter" : "ollama",
  };

  if (isAllowedModelConfig(candidate)) {
    return candidate;
  }

  return getSafeDefaultModelConfig();
}

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

export function getOpenRouterMetadataHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_TITLE || "Nodes",
  };
}
