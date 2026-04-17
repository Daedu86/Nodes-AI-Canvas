import {
  DEFAULT_OLLAMA_MODELS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  normalizeEditableModelList,
} from "@/lib/llm/provider-catalog";

const normalizeHostname = (value: string) => value.trim().replace(/^\[|\]$/g, "").toLowerCase();

export type OllamaBaseUrlNormalizationResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

// Client-safe normalization: validate URL + protocol, strip credentials.
// Host allowlisting is enforced server-side when saving settings and when creating runtime overrides.
export function normalizeOllamaBaseUrl(input: string): OllamaBaseUrlNormalizationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Ollama base URL is required." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Ollama base URL must be a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Ollama base URL must start with http:// or https://." };
  }

  // Basic sanity check to prevent obviously unsafe URLs from persisting in state.
  // The server will apply stricter allowlisting rules.
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return { ok: false, error: "Ollama base URL must include a hostname." };
  }

  // Normalize: strip username/password, keep origin + path as user entered.
  url.username = "";
  url.password = "";
  return { ok: true, normalized: url.toString() };
}

export type OllamaProviderSettings = {
  baseUrl: string;
  enabled: boolean;
  models: string[];
};

export type OpenRouterProviderSettings = {
  apiKey: string;
  clearApiKey?: boolean;
  customModels?: string[];
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
      customModels: [],
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
      customModels: [...(DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.customModels ?? [])],
      enabledModels: [...DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.enabledModels],
    },
  },
});

const normalizeOpenRouterCustomModels = (value: unknown) => {
  const entries = normalizeEditableModelList(
    Array.isArray(value) ? (value as string[]) : typeof value === "string" ? value : [],
  );

  // Keep it simple but safe: trim/unique already handled, now enforce a reasonable size and shape.
  return entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 120)
    .filter((entry) => !/\s/.test(entry))
    // Model ids are typically `org/model[:variant]` or `openrouter/free`.
    .filter((entry) => /^[A-Za-z0-9._\-/:]+$/.test(entry))
    .slice(0, 50);
};

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
    customModels: normalizeOpenRouterCustomModels(providers.openrouter?.customModels),
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

  const maybeValidated = normalizeOllamaBaseUrl(base.providers.ollama.baseUrl);
  if (maybeValidated.ok) {
    base.providers.ollama.baseUrl = maybeValidated.normalized;
  } else {
    base.providers.ollama.baseUrl = DEFAULT_LLM_SETTINGS_STATE.providers.ollama.baseUrl;
  }

  if (base.providers.ollama.models.length === 0) {
    base.providers.ollama.models = [...DEFAULT_OLLAMA_MODELS];
  }

  return base;
};

const stripOpenRouterMetadata = (
  provider: OpenRouterProviderSettings,
): OpenRouterProviderSettings => ({
  apiKey: provider.apiKey,
  customModels: [...(provider.customModels ?? [])],
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
        customModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.customModels
          : currentNormalized.providers.openrouter.customModels,
        enabledModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.enabledModels
          : currentNormalized.providers.openrouter.enabledModels,
      },
    },
  });
};
