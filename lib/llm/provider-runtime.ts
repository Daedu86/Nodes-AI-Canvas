import { createOpenAI } from "@ai-sdk/openai";
import { createOllama, ollama } from "ollama-ai-provider";
import { getLlmSettings } from "@/lib/llm-settings-store";
import {
  getOpenRouterMetadataHeaders,
  OLLAMA_API_URL,
  OPENROUTER_BASE_URL,
  type Provider,
  type ResolvedModelConfig,
} from "@/lib/llm/config";
import type { LlmSettingsState } from "@/lib/llm/user-settings";
import { type LlmRequestOverrides } from "@/lib/llm/request-overrides";

export type MissingProviderCredential = {
  code: "missing_openrouter_key";
  message: string;
  status: number;
};

const normalizeValue = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveApiKey = (
  overrideValue: string | undefined,
  envValue: string | undefined,
) => normalizeValue(overrideValue) ?? normalizeValue(envValue);

function createOverridesFromSettings(
  settings: LlmSettingsState | null | undefined,
): LlmRequestOverrides {
  return {
    ollamaBaseUrl: normalizeValue(settings?.providers.ollama.baseUrl),
    openrouterApiKey: normalizeValue(settings?.providers.openrouter.apiKey),
  };
}

export async function getUserModelOverrides(userId: string) {
  const settings = await getLlmSettings(userId);
  return createOverridesFromSettings(settings);
}

export function getMissingProviderCredential(
  provider: Provider,
  overrides: LlmRequestOverrides,
): MissingProviderCredential | null {
  switch (provider) {
    case "openrouter":
      return resolveApiKey(overrides.openrouterApiKey, process.env.OPENROUTER_API_KEY)
        ? null
        : {
            code: "missing_openrouter_key",
            message: "OpenRouter is not configured on this deployment.",
            status: 503,
          };
    case "ollama":
    default:
      return null;
  }
}

export function createLanguageModel(
  config: ResolvedModelConfig,
  overrides: LlmRequestOverrides,
) {
  switch (config.provider) {
    case "openrouter": {
      const apiKey = resolveApiKey(overrides.openrouterApiKey, process.env.OPENROUTER_API_KEY);
      return createOpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        headers: getOpenRouterMetadataHeaders(),
        name: "openrouter",
      })(config.modelId);
    }
    case "ollama":
    default: {
      const baseURL = normalizeValue(overrides.ollamaBaseUrl) ?? OLLAMA_API_URL;
      if (baseURL === OLLAMA_API_URL) {
        return ollama(config.modelId);
      }
      return createOllama({ baseURL })(config.modelId);
    }
  }
}
