import type { LlmContextArtifact } from "@/lib/session-artifacts";
import {
  LLM_PROVIDER_IDS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  SAFE_DEFAULT_MODEL,
  type LlmProviderId,
} from "@/lib/llm/provider-catalog";

export type Provider = LlmProviderId;

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

export type ResolvedModelConfig = {
  modelId: string;
  provider: Provider;
};

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || SAFE_DEFAULT_MODEL.modelId;
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1";
export const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434/api";

const DEFAULT_ALLOWED_MODELS: Record<Provider, string[]> = {
  anthropic: [],
  google: [],
  openai: [],
  openrouter: OPENROUTER_FREE_MODEL_OPTIONS.map((option) => option.modelId),
  ollama: ["gemma3:4b"],
};

const parseAllowedModels = (value: string | undefined) =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) ?? [];

const isKnownProvider = (value: string | undefined): value is Provider =>
  typeof value === "string" && LLM_PROVIDER_IDS.includes(value as Provider);

const inferProviderFromModel = (modelId: string): Provider => {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("/")) return "openrouter";
  if (normalized.includes("claude")) return "anthropic";
  if (normalized.includes("gemini")) return "google";
  if (
    normalized.startsWith("gpt") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "openai";
  }
  return "ollama";
};

export function getAllowedModels(provider: Provider) {
  const envValue =
    provider === "openrouter"
      ? process.env.ALLOWED_OPENROUTER_MODELS
      : provider === "ollama"
        ? process.env.ALLOWED_OLLAMA_MODELS
        : provider === "openai"
          ? process.env.ALLOWED_OPENAI_MODELS
          : provider === "anthropic"
            ? process.env.ALLOWED_ANTHROPIC_MODELS
            : process.env.ALLOWED_GOOGLE_MODELS;
  const configured = parseAllowedModels(envValue);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_MODELS[provider];
}

export function isAllowedModelConfig(config: { modelId: string; provider: Provider }) {
  if (!config.modelId.trim()) return false;
  if (config.provider === "openrouter") {
    return getAllowedModels(config.provider).includes(config.modelId);
  }
  const allowed = getAllowedModels(config.provider);
  return allowed.length > 0 ? allowed.includes(config.modelId) : true;
}

export function getRequestedModelConfig(input: ModelResolutionInput): ResolvedModelConfig {
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
    inferProviderFromModel(model);

  return {
    modelId: model,
    provider: isKnownProvider(provider) ? provider : inferProviderFromModel(model),
  };
}

export function getSafeDefaultModelConfig(): ResolvedModelConfig {
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

export function resolveModelConfig(input: ModelResolutionInput): ResolvedModelConfig {
  const candidate = getRequestedModelConfig(input);

  if (isAllowedModelConfig(candidate)) {
    return candidate;
  }

  return getSafeDefaultModelConfig();
}

export function getModelAttemptChain(primary: ResolvedModelConfig): ResolvedModelConfig[] {
  const attempts: ResolvedModelConfig[] = [{ ...primary }];
  const preferredProviderModels =
    primary.provider === "openrouter"
      ? getAllowedModels(primary.provider).map((modelId) => ({
          modelId,
          provider: primary.provider,
        }))
      : [];
  const safeDefault = getSafeDefaultModelConfig();

  for (const candidate of [...preferredProviderModels, safeDefault]) {
    if (
      attempts.some(
        (attempt) =>
          attempt.modelId === candidate.modelId && attempt.provider === candidate.provider,
      )
    ) {
      continue;
    }
    attempts.push(candidate);
  }

  return attempts;
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
