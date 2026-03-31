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

  return {
    modelId: model,
    provider: provider === "openrouter" ? "openrouter" : "ollama",
  };
}

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

export function getOpenRouterMetadataHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_TITLE || "assistant-ui-starter",
  };
}
