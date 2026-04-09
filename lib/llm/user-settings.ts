import {
  DEFAULT_OLLAMA_MODELS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  normalizeEditableModelList,
} from "@/lib/llm/provider-catalog";

export type ProviderWithApiKey = "anthropic" | "google" | "openai";

export type ApiProviderSettings = {
  apiKey: string;
  clearApiKey?: boolean;
  enabled: boolean;
  hasApiKey?: boolean;
  models: string[];
};

export type OllamaProviderSettings = {
  baseUrl: string;
  enabled: boolean;
  models: string[];
};

export type OpenRouterProviderSettings = {
  apiKey: string;
  clearApiKey?: boolean;
  enabledModels: string[];
  hasApiKey?: boolean;
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
      clearApiKey: false,
      enabled: false,
      hasApiKey: false,
      models: [],
    },
    google: {
      apiKey: "",
      clearApiKey: false,
      enabled: false,
      hasApiKey: false,
      models: [],
    },
    ollama: {
      baseUrl: "http://localhost:11434/api",
      enabled: true,
      models: DEFAULT_OLLAMA_MODELS,
    },
    openai: {
      apiKey: "",
      clearApiKey: false,
      enabled: false,
      hasApiKey: false,
      models: [],
    },
    openrouter: {
      apiKey: "",
      clearApiKey: false,
      enabledModels: OPENROUTER_FREE_MODEL_OPTIONS.map((option) => option.modelId),
      hasApiKey: false,
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
    clearApiKey: providers.openrouter?.clearApiKey === true,
    enabledModels:
      openrouterModels.length > 0 ? openrouterModels : base.providers.openrouter.enabledModels,
    hasApiKey:
      providers.openrouter?.hasApiKey !== undefined
        ? providers.openrouter.hasApiKey
        : typeof providers.openrouter?.apiKey === "string" &&
            providers.openrouter.apiKey.trim().length > 0,
  };

  const normalizeApiProvider = (
    provider: ApiProviderSettings | undefined,
    fallback: ApiProviderSettings,
  ): ApiProviderSettings => ({
    apiKey: typeof provider?.apiKey === "string" ? provider.apiKey : fallback.apiKey,
    clearApiKey: provider?.clearApiKey === true,
    enabled: provider?.enabled !== undefined ? provider.enabled : fallback.enabled,
    hasApiKey:
      provider?.hasApiKey !== undefined
        ? provider.hasApiKey
        : typeof provider?.apiKey === "string"
          ? provider.apiKey.trim().length > 0
          : fallback.hasApiKey,
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

const stripApiProviderMetadata = (provider: ApiProviderSettings): ApiProviderSettings => ({
  apiKey: provider.apiKey,
  enabled: provider.enabled,
  models: [...provider.models],
});

const stripOpenRouterMetadata = (
  provider: OpenRouterProviderSettings,
): OpenRouterProviderSettings => ({
  apiKey: provider.apiKey,
  enabledModels: [...provider.enabledModels],
});

export const stripLlmSettingsCredentialMetadata = (
  input: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const normalized = normalizeLlmSettingsState(input);
  return {
    providers: {
      anthropic: stripApiProviderMetadata(normalized.providers.anthropic),
      google: stripApiProviderMetadata(normalized.providers.google),
      ollama: {
        baseUrl: normalized.providers.ollama.baseUrl,
        enabled: normalized.providers.ollama.enabled,
        models: [...normalized.providers.ollama.models],
      },
      openai: stripApiProviderMetadata(normalized.providers.openai),
      openrouter: stripOpenRouterMetadata(normalized.providers.openrouter),
    },
  };
};

export const maskLlmSettingsState = (
  input: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const normalized = stripLlmSettingsCredentialMetadata(input);
  return {
    providers: {
      anthropic: {
        ...normalized.providers.anthropic,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: normalized.providers.anthropic.apiKey.trim().length > 0,
      },
      google: {
        ...normalized.providers.google,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: normalized.providers.google.apiKey.trim().length > 0,
      },
      ollama: {
        ...normalized.providers.ollama,
      },
      openai: {
        ...normalized.providers.openai,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: normalized.providers.openai.apiKey.trim().length > 0,
      },
      openrouter: {
        ...normalized.providers.openrouter,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: normalized.providers.openrouter.apiKey.trim().length > 0,
      },
    },
  };
};

const resolveMergedApiKey = (
  currentValue: string,
  incomingValue: string | undefined,
  clearApiKey: boolean | undefined,
) => {
  if (clearApiKey) {
    return "";
  }
  const trimmed = incomingValue?.trim();
  return trimmed ? incomingValue ?? "" : currentValue;
};

export const mergeLlmSettingsState = (
  current: Partial<LlmSettingsState> | null | undefined,
  incoming: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const currentNormalized = stripLlmSettingsCredentialMetadata(current);
  const nextProviders = incoming?.providers;
  const incomingNormalized = normalizeLlmSettingsState(incoming);
  const hasIncomingProvider = <T extends keyof LlmSettingsState["providers"]>(provider: T) =>
    nextProviders?.[provider] !== undefined;

  return stripLlmSettingsCredentialMetadata({
    providers: {
      anthropic: {
        apiKey: resolveMergedApiKey(
          currentNormalized.providers.anthropic.apiKey,
          nextProviders?.anthropic?.apiKey,
          nextProviders?.anthropic?.clearApiKey,
        ),
        enabled: hasIncomingProvider("anthropic")
          ? incomingNormalized.providers.anthropic.enabled
          : currentNormalized.providers.anthropic.enabled,
        models: hasIncomingProvider("anthropic")
          ? incomingNormalized.providers.anthropic.models
          : currentNormalized.providers.anthropic.models,
      },
      google: {
        apiKey: resolveMergedApiKey(
          currentNormalized.providers.google.apiKey,
          nextProviders?.google?.apiKey,
          nextProviders?.google?.clearApiKey,
        ),
        enabled: hasIncomingProvider("google")
          ? incomingNormalized.providers.google.enabled
          : currentNormalized.providers.google.enabled,
        models: hasIncomingProvider("google")
          ? incomingNormalized.providers.google.models
          : currentNormalized.providers.google.models,
      },
      ollama: {
        baseUrl: hasIncomingProvider("ollama")
          ? incomingNormalized.providers.ollama.baseUrl
          : currentNormalized.providers.ollama.baseUrl,
        enabled: hasIncomingProvider("ollama")
          ? incomingNormalized.providers.ollama.enabled
          : currentNormalized.providers.ollama.enabled,
        models: hasIncomingProvider("ollama")
          ? incomingNormalized.providers.ollama.models
          : currentNormalized.providers.ollama.models,
      },
      openai: {
        apiKey: resolveMergedApiKey(
          currentNormalized.providers.openai.apiKey,
          nextProviders?.openai?.apiKey,
          nextProviders?.openai?.clearApiKey,
        ),
        enabled: hasIncomingProvider("openai")
          ? incomingNormalized.providers.openai.enabled
          : currentNormalized.providers.openai.enabled,
        models: hasIncomingProvider("openai")
          ? incomingNormalized.providers.openai.models
          : currentNormalized.providers.openai.models,
      },
      openrouter: {
        apiKey: resolveMergedApiKey(
          currentNormalized.providers.openrouter.apiKey,
          nextProviders?.openrouter?.apiKey,
          nextProviders?.openrouter?.clearApiKey,
        ),
        enabledModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.enabledModels
          : currentNormalized.providers.openrouter.enabledModels,
      },
    },
  });
};
