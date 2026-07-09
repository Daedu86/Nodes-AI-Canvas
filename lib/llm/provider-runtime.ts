import { createOpenAI } from "@ai-sdk/openai";
import { createOllama, ollama } from "ollama-ai-provider";
import { getLlmSettings } from "@/lib/llm-settings-store";
import {
  getOpenRouterMetadataHeaders,
  getModelAttemptChain,
  OLLAMA_API_URL,
  OPENROUTER_BASE_URL,
  type Provider,
  type ResolvedModelConfig,
} from "@/lib/llm/config";
import type { LlmSettingsState } from "@/lib/llm/user-settings";
import { isVisionCapableModel } from "@/lib/llm/provider-catalog";
import { validateOllamaBaseUrl } from "@/lib/server/ollama-base-url";
import { type LlmRequestOverrides } from "@/lib/llm/request-overrides";
import {
  getDefaultUserPlan,
  getOpenRouterCredentialPolicy,
  type UserPlan,
} from "@/lib/user-plan";

export type MissingProviderCredential = {
  code: "missing_ollama_key" | "missing_openrouter_key";
  message: string;
  status: number;
};

const normalizeValue = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const MAX_OPENROUTER_FALLBACK_MODELS = 3;
const OPENROUTER_ROUTER_MODEL = "openrouter/free";
const OPENROUTER_TEXT_FIRST_FALLBACKS = [
  OPENROUTER_ROUTER_MODEL,
] as const;
const OPENROUTER_VISION_FIRST_FALLBACKS = [
  OPENROUTER_ROUTER_MODEL,
] as const;

export type ProviderRuntimeOptions = {
  userPlan?: UserPlan;
};

const resolveUserPlan = (options?: ProviderRuntimeOptions) =>
  options?.userPlan ?? getDefaultUserPlan();

const resolveOpenRouterApiKey = (
  overrides: LlmRequestOverrides,
  options?: ProviderRuntimeOptions,
) => {
  const userPlan = resolveUserPlan(options);
  const userKey = normalizeValue(overrides.openrouterApiKey);
  if (getOpenRouterCredentialPolicy(userPlan).requireUserKey) return userKey;
  return userKey ?? normalizeValue(process.env.OPENROUTER_API_KEY);
};

function createOverridesFromSettings(
  settings: LlmSettingsState | null | undefined,
): LlmRequestOverrides {
  const rawOllamaBaseUrl = normalizeValue(settings?.providers.ollama.baseUrl);
  const validatedOllamaBaseUrl = rawOllamaBaseUrl
    ? validateOllamaBaseUrl(rawOllamaBaseUrl)
    : null;

  const openrouterKeys = settings?.providers.openrouter.apiKeys ?? [];
  const configuredActiveKeyId = settings?.providers.openrouter.activeApiKeyId ?? null;
  const activeEntry =
    (configuredActiveKeyId
      ? openrouterKeys.find((entry) => entry.id === configuredActiveKeyId)
      : undefined) ?? openrouterKeys[0];

  const ollamaKeys = settings?.providers.ollama.apiKeys ?? [];
  const configuredOllamaActiveKeyId = settings?.providers.ollama.activeApiKeyId ?? null;
  const activeOllamaEntry =
    (configuredOllamaActiveKeyId
      ? ollamaKeys.find((entry) => entry.id === configuredOllamaActiveKeyId)
      : undefined) ?? ollamaKeys[0];

  return {
    ollamaBaseUrl: validatedOllamaBaseUrl?.ok ? validatedOllamaBaseUrl.normalized : undefined,
    ollamaApiKey:
      normalizeValue(activeOllamaEntry?.key) ?? normalizeValue(settings?.providers.ollama.apiKey),
    openrouterApiKey:
      normalizeValue(activeEntry?.key) ?? normalizeValue(settings?.providers.openrouter.apiKey),
  };
}

const isOllamaCloudEndpoint = (baseUrl?: string) => {
  const value = normalizeValue(baseUrl);
  if (!value) return false;
  return value.includes("ollama.com");
};

function pickOpenRouterFallbackModels(config: ResolvedModelConfig) {
  const candidates = getModelAttemptChain(config)
    .filter((candidate) => candidate.provider === "openrouter" && candidate.modelId !== config.modelId)
    .map((candidate) => candidate.modelId);

  if (candidates.length === 0) {
    return [];
  }

  const preferredOrder = isVisionCapableModel(config.provider, config.modelId)
    ? OPENROUTER_VISION_FIRST_FALLBACKS
    : OPENROUTER_TEXT_FIRST_FALLBACKS;
  const candidateSet = new Set(candidates);
  const ordered: string[] = [];

  for (const modelId of preferredOrder) {
    if (candidateSet.has(modelId) && !ordered.includes(modelId)) {
      ordered.push(modelId);
    }
  }

  for (const modelId of candidates) {
    if (!ordered.includes(modelId)) {
      ordered.push(modelId);
    }
  }

  // OpenRouter currently rejects `models` arrays longer than 3 items.
  // Always reserve one slot for the free router if it is available.
  if (candidateSet.has(OPENROUTER_ROUTER_MODEL) && !ordered.includes(OPENROUTER_ROUTER_MODEL)) {
    ordered.push(OPENROUTER_ROUTER_MODEL);
  }

  let selected = ordered.slice(0, MAX_OPENROUTER_FALLBACK_MODELS);
  if (
    candidateSet.has(OPENROUTER_ROUTER_MODEL) &&
    !selected.includes(OPENROUTER_ROUTER_MODEL)
  ) {
    selected = [
      ...selected.slice(0, MAX_OPENROUTER_FALLBACK_MODELS - 1),
      OPENROUTER_ROUTER_MODEL,
    ];
  }

  return selected;
}

const createOpenRouterFetchWithFallbacks = (config: ResolvedModelConfig) => {
  if (config.modelId === "openrouter/free") {
    return fetch;
  }

  const fallbackModels = pickOpenRouterFallbackModels(config);

  if (fallbackModels.length === 0) {
    return fetch;
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") {
      return fetch(input, init);
    }

    try {
      const body = JSON.parse(init.body) as {
        model?: unknown;
        models?: unknown;
      };

      if (body.model !== config.modelId || Array.isArray(body.models)) {
        return fetch(input, init);
      }

      return fetch(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          models: fallbackModels,
        }),
      });
    } catch {
      return fetch(input, init);
    }
  };
};

export async function getUserModelOverrides(userId: string) {
  const settings = await getLlmSettings(userId);
  return createOverridesFromSettings(settings);
}

export function getMissingProviderCredential(
  provider: Provider,
  overrides: LlmRequestOverrides,
  options?: ProviderRuntimeOptions,
): MissingProviderCredential | null {
  const userPlan = resolveUserPlan(options);
  const openRouterPolicy = getOpenRouterCredentialPolicy(userPlan);
  switch (provider) {
    case "openrouter":
      if (resolveOpenRouterApiKey(overrides, options)) return null;
      if (openRouterPolicy.requireUserKey) {
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
      if (isOllamaCloudEndpoint(overrides.ollamaBaseUrl) && !normalizeValue(overrides.ollamaApiKey)) {
        return {
          code: "missing_ollama_key",
          message: "Ollama cloud endpoint needs your API key. Add one in Profile > LLM Models.",
          status: 401,
        };
      }
      return null;
    default:
      return null;
  }
}

export function createLanguageModel(
  config: ResolvedModelConfig,
  overrides: LlmRequestOverrides,
  options?: ProviderRuntimeOptions,
) {
  switch (config.provider) {
    case "openrouter": {
      const apiKey = resolveOpenRouterApiKey(overrides, options);
      if (!apiKey) {
        throw new Error("Missing OpenRouter API key");
      }
      return createOpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        fetch: createOpenRouterFetchWithFallbacks(config),
        headers: getOpenRouterMetadataHeaders(),
        name: "openrouter",
      })(config.modelId);
    }
    case "ollama":
    default: {
      const baseURL = normalizeValue(overrides.ollamaBaseUrl) ?? OLLAMA_API_URL;
      const apiKey = normalizeValue(overrides.ollamaApiKey);
      if (baseURL === OLLAMA_API_URL && !apiKey) {
        return ollama(config.modelId);
      }
      return createOllama({
        baseURL,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      })(config.modelId);
    }
  }
}
