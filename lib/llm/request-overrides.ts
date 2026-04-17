export const REQUEST_OPENROUTER_KEY_HEADER = "x-nodes-openrouter-key";
export const REQUEST_OLLAMA_URL_HEADER = "x-nodes-ollama-base-url";
export const REQUEST_OLLAMA_KEY_HEADER = "x-nodes-ollama-key";

export type LlmRequestOverrides = {
  ollamaApiKey?: string;
  ollamaBaseUrl?: string;
  openrouterApiKey?: string;
};

const normalizeValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function readLlmRequestOverrides(headers: Headers | Pick<Headers, "get">): LlmRequestOverrides {
  return {
    ollamaApiKey: normalizeValue(headers.get(REQUEST_OLLAMA_KEY_HEADER)),
    ollamaBaseUrl: normalizeValue(headers.get(REQUEST_OLLAMA_URL_HEADER)),
    openrouterApiKey: normalizeValue(headers.get(REQUEST_OPENROUTER_KEY_HEADER)),
  };
}

export function getProviderOverrideHeaders(
  provider: string | null | undefined,
  overrides: LlmRequestOverrides,
): Record<string, string> {
  switch (provider) {
    case "ollama":
      return {
        ...(overrides.ollamaBaseUrl
          ? { [REQUEST_OLLAMA_URL_HEADER]: overrides.ollamaBaseUrl }
          : {}),
        ...(overrides.ollamaApiKey
          ? { [REQUEST_OLLAMA_KEY_HEADER]: overrides.ollamaApiKey }
          : {}),
      };
    case "openrouter":
      return overrides.openrouterApiKey
        ? { [REQUEST_OPENROUTER_KEY_HEADER]: overrides.openrouterApiKey }
        : {};
    default:
      return {};
  }
}
