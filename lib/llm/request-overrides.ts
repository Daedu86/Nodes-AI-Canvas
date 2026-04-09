import type { LlmProviderId } from "@/lib/llm/provider-catalog";

export const REQUEST_OPENROUTER_KEY_HEADER = "x-nodes-openrouter-key";
export const REQUEST_OPENAI_KEY_HEADER = "x-nodes-openai-key";
export const REQUEST_ANTHROPIC_KEY_HEADER = "x-nodes-anthropic-key";
export const REQUEST_GOOGLE_KEY_HEADER = "x-nodes-google-key";
export const REQUEST_OLLAMA_URL_HEADER = "x-nodes-ollama-base-url";

export type LlmRequestOverrides = {
  anthropicApiKey?: string;
  googleApiKey?: string;
  ollamaBaseUrl?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
};

const normalizeValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function readLlmRequestOverrides(headers: Headers | Pick<Headers, "get">): LlmRequestOverrides {
  return {
    anthropicApiKey: normalizeValue(headers.get(REQUEST_ANTHROPIC_KEY_HEADER)),
    googleApiKey: normalizeValue(headers.get(REQUEST_GOOGLE_KEY_HEADER)),
    ollamaBaseUrl: normalizeValue(headers.get(REQUEST_OLLAMA_URL_HEADER)),
    openaiApiKey: normalizeValue(headers.get(REQUEST_OPENAI_KEY_HEADER)),
    openrouterApiKey: normalizeValue(headers.get(REQUEST_OPENROUTER_KEY_HEADER)),
  };
}

export function getProviderOverrideHeaders(
  provider: string | null | undefined,
  overrides: LlmRequestOverrides,
): Record<string, string> {
  const normalizedProvider = provider as LlmProviderId | undefined;
  switch (normalizedProvider) {
    case "anthropic":
      return overrides.anthropicApiKey
        ? { [REQUEST_ANTHROPIC_KEY_HEADER]: overrides.anthropicApiKey }
        : {};
    case "google":
      return overrides.googleApiKey
        ? { [REQUEST_GOOGLE_KEY_HEADER]: overrides.googleApiKey }
        : {};
    case "ollama":
      return overrides.ollamaBaseUrl
        ? { [REQUEST_OLLAMA_URL_HEADER]: overrides.ollamaBaseUrl }
        : {};
    case "openai":
      return overrides.openaiApiKey
        ? { [REQUEST_OPENAI_KEY_HEADER]: overrides.openaiApiKey }
        : {};
    case "openrouter":
      return overrides.openrouterApiKey
        ? { [REQUEST_OPENROUTER_KEY_HEADER]: overrides.openrouterApiKey }
        : {};
    default:
      return {};
  }
}
