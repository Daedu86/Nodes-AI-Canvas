import {
  DEFAULT_OLLAMA_MODELS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  normalizeEditableModelList,
} from "@/lib/llm/provider-catalog";

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
    ollama: OllamaProviderSettings;
    openrouter: OpenRouterProviderSettings;
  };
};

export const DEFAULT_LLM_SETTINGS_STATE: LlmSettingsState = {
  providers: {
    ollama: {
      baseUrl: "http://localhost:11434/api",
      enabled: true,
      models: DEFAULT_OLLAMA_MODELS,
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
    ollama: {
      ...DEFAULT_LLM_SETTINGS_STATE.providers.ollama,
      models: [...DEFAULT_LLM_SETTINGS_STATE.providers.ollama.models],
    },
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
      ollama: {
        baseUrl: normalized.providers.ollama.baseUrl,
        enabled: normalized.providers.ollama.enabled,
        models: [...normalized.providers.ollama.models],
      },
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
      ollama: {
        ...normalized.providers.ollama,
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
