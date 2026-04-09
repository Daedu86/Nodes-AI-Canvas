import {
  DEFAULT_OLLAMA_MODELS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  normalizeEditableModelList,
} from "@/lib/llm/provider-catalog";

export type ProviderWithApiKey = "anthropic" | "google" | "openai";

export type ApiProviderSettings = {
  apiKey: string;
  enabled: boolean;
  models: string[];
};

export type OllamaProviderSettings = {
  baseUrl: string;
  enabled: boolean;
  models: string[];
};

export type OpenRouterProviderSettings = {
  apiKey: string;
  enabledModels: string[];
};

export type LlmSettingsState = {
  providers: {
    anthropic: ApiProviderSettings;
    google: ApiProviderSettings;
    ollama: OllamaProviderSettings;
    openai: ApiProviderSettings;
    openrouter: OpenRouterProviderSettings;
  };
};

export const DEFAULT_LLM_SETTINGS_STATE: LlmSettingsState = {
  providers: {
    anthropic: {
      apiKey: "",
      enabled: false,
      models: [],
    },
    google: {
      apiKey: "",
      enabled: false,
      models: [],
    },
    ollama: {
      baseUrl: "http://localhost:11434/api",
      enabled: true,
      models: DEFAULT_OLLAMA_MODELS,
    },
    openai: {
      apiKey: "",
      enabled: false,
      models: [],
    },
    openrouter: {
      apiKey: "",
      enabledModels: OPENROUTER_FREE_MODEL_OPTIONS.map((option) => option.modelId),
    },
  },
};

export const cloneDefaultLlmSettingsState = (): LlmSettingsState => ({
  providers: {
    anthropic: { ...DEFAULT_LLM_SETTINGS_STATE.providers.anthropic, models: [] },
    google: { ...DEFAULT_LLM_SETTINGS_STATE.providers.google, models: [] },
    ollama: {
      ...DEFAULT_LLM_SETTINGS_STATE.providers.ollama,
      models: [...DEFAULT_LLM_SETTINGS_STATE.providers.ollama.models],
    },
    openai: { ...DEFAULT_LLM_SETTINGS_STATE.providers.openai, models: [] },
    openrouter: {
      ...DEFAULT_LLM_SETTINGS_STATE.providers.openrouter,
      enabledModels: [...DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.enabledModels],
    },
  },
});

export const normalizeLlmSettingsState = (
  input: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const base = cloneDefaultLlmSettingsState();
  const providers = input?.providers;
  if (!providers || typeof providers !== "object") {
    return base;
  }

  const openrouterModels = Array.isArray(providers.openrouter?.enabledModels)
    ? providers.openrouter.enabledModels.filter((modelId): modelId is string =>
        OPENROUTER_FREE_MODEL_OPTIONS.some((option) => option.modelId === modelId),
      )
    : base.providers.openrouter.enabledModels;

  base.providers.openrouter = {
    apiKey:
      typeof providers.openrouter?.apiKey === "string" ? providers.openrouter.apiKey : "",
    enabledModels:
      openrouterModels.length > 0 ? openrouterModels : base.providers.openrouter.enabledModels,
  };

  const normalizeApiProvider = (
    provider: ApiProviderSettings | undefined,
    fallback: ApiProviderSettings,
  ): ApiProviderSettings => ({
    apiKey: typeof provider?.apiKey === "string" ? provider.apiKey : fallback.apiKey,
    enabled: provider?.enabled !== undefined ? provider.enabled : fallback.enabled,
    models: normalizeEditableModelList(provider?.models ?? fallback.models),
  });

  base.providers.openai = normalizeApiProvider(providers.openai, base.providers.openai);
  base.providers.anthropic = normalizeApiProvider(providers.anthropic, base.providers.anthropic);
  base.providers.google = normalizeApiProvider(providers.google, base.providers.google);
  base.providers.ollama = {
    baseUrl:
      typeof providers.ollama?.baseUrl === "string"
        ? providers.ollama.baseUrl
        : base.providers.ollama.baseUrl,
    enabled:
      providers.ollama?.enabled !== undefined
        ? providers.ollama.enabled
        : base.providers.ollama.enabled,
    models: normalizeEditableModelList(providers.ollama?.models ?? base.providers.ollama.models),
  };

  if (base.providers.ollama.models.length === 0) {
    base.providers.ollama.models = [...DEFAULT_OLLAMA_MODELS];
  }

  return base;
};
