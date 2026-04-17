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
import { validateOllamaBaseUrl } from "@/lib/server/ollama-base-url";
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

// Safety default for public deployments:
// - By default, we do NOT use a shared deployment OpenRouter key for end users.
// - Operators can explicitly opt in by setting OPENROUTER_ALLOW_DEPLOYMENT_KEY=1.
const isOpenRouterDeploymentKeyAllowed = () =>
  process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY === "1";

const isOpenRouterUserKeyRequired = () =>
  process.env.OPENROUTER_REQUIRE_USER_KEY === "1" || !isOpenRouterDeploymentKeyAllowed();

const resolveOpenRouterApiKey = (overrides: LlmRequestOverrides) => {
  const userKey = normalizeValue(overrides.openrouterApiKey);
  if (isOpenRouterUserKeyRequired()) return userKey;
  return userKey ?? normalizeValue(process.env.OPENROUTER_API_KEY);
};

function createOverridesFromSettings(
  settings: LlmSettingsState | null | undefined,
): LlmRequestOverrides {
  const rawOllamaBaseUrl = normalizeValue(settings?.providers.ollama.baseUrl);
  const validatedOllamaBaseUrl = rawOllamaBaseUrl
    ? validateOllamaBaseUrl(rawOllamaBaseUrl)
    : null;

  return {
    ollamaBaseUrl: validatedOllamaBaseUrl?.ok ? validatedOllamaBaseUrl.normalized : undefined,
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
      if (resolveOpenRouterApiKey(overrides)) return null;
      if (isOpenRouterUserKeyRequired()) {
        return {
          code: "missing_openrouter_key",
          message: "OpenRouter needs your API key. Add one in Profile > LLM Models.",
          status: 401,
        };
      }
      return {
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
      const apiKey = resolveOpenRouterApiKey(overrides);
      if (!apiKey) {
        throw new Error("Missing OpenRouter API key");
      }
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
