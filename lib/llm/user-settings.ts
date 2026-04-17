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
  activeApiKeyId?: string | null;
  apiKey: string;
  apiKeys?: Array<{
    createdAt?: string;
    hasKey?: boolean;
    id: string;
    key: string;
    name: string;
  }>;
  clearApiKey?: boolean;
  customModels?: string[];
  deletedModels?: string[];
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
      activeApiKeyId: null,
      apiKey: "",
      apiKeys: [],
      clearApiKey: false,
      customModels: [],
      deletedModels: [],
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
      activeApiKeyId: DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.activeApiKeyId ?? null,
      apiKeys: [...(DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.apiKeys ?? [])],
      customModels: [...(DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.customModels ?? [])],
      deletedModels: [...(DEFAULT_LLM_SETTINGS_STATE.providers.openrouter.deletedModels ?? [])],
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

const normalizeOpenRouterApiKeys = (value: unknown) => {
  const rawEntries = Array.isArray(value) ? value : [];
  return rawEntries
    .map((entry): NonNullable<OpenRouterProviderSettings["apiKeys"]>[number] | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const key = typeof record.key === "string" ? record.key : "";
      if (!id) return null;
      return {
        id,
        name: name || "OpenRouter key",
        key,
        hasKey: record.hasKey === true || key.trim().length > 0,
        createdAt:
          typeof record.createdAt === "string" && record.createdAt.trim().length > 0
            ? record.createdAt
            : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 20);
};

const getActiveApiKeyFromList = (provider: OpenRouterProviderSettings) => {
  const keys = provider.apiKeys ?? [];
  if (keys.length === 0) return undefined;
  if (provider.activeApiKeyId) {
    const active = keys.find((entry) => entry.id === provider.activeApiKeyId);
    if (active?.key?.trim()) return active.key;
  }
  return keys.find((entry) => entry.key.trim().length > 0)?.key;
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
    ? providers.openrouter.enabledModels
    : null;

  const deletedOpenRouterModels = Array.isArray(providers.openrouter?.deletedModels)
    ? providers.openrouter.deletedModels.filter((modelId): modelId is string =>
        OPENROUTER_FREE_MODEL_OPTIONS.some((option) => option.modelId === modelId),
      )
    : [];
  const deletedOpenRouterModelSet = new Set(deletedOpenRouterModels);
  const defaultOpenRouterEnabledModels = OPENROUTER_FREE_MODEL_OPTIONS.map((option) => option.modelId)
    .filter((modelId) => !deletedOpenRouterModelSet.has(modelId));
  const normalizedOpenRouterEnabledModels = Array.isArray(openrouterModels)
    ? openrouterModels.filter(
        (modelId): modelId is string =>
          OPENROUTER_FREE_MODEL_OPTIONS.some((option) => option.modelId === modelId) &&
          !deletedOpenRouterModelSet.has(modelId),
      )
    : defaultOpenRouterEnabledModels;

  base.providers.openrouter = {
    activeApiKeyId:
      typeof providers.openrouter?.activeApiKeyId === "string" &&
      providers.openrouter.activeApiKeyId.trim().length > 0
        ? providers.openrouter.activeApiKeyId.trim()
        : null,
    apiKey:
      typeof providers.openrouter?.apiKey === "string" ? providers.openrouter.apiKey : "",
    apiKeys: normalizeOpenRouterApiKeys(providers.openrouter?.apiKeys),
    clearApiKey: providers.openrouter?.clearApiKey === true,
    customModels: normalizeOpenRouterCustomModels(providers.openrouter?.customModels),
    deletedModels: deletedOpenRouterModels,
    enabledModels: normalizedOpenRouterEnabledModels,
    hasApiKey:
      providers.openrouter?.hasApiKey !== undefined
        ? providers.openrouter.hasApiKey
        : typeof providers.openrouter?.apiKey === "string" &&
            providers.openrouter.apiKey.trim().length > 0,
  };

  // Backward compatibility: when only a legacy single apiKey exists, synthesize one key entry.
  if ((base.providers.openrouter.apiKeys?.length ?? 0) === 0) {
    const legacyKey = base.providers.openrouter.apiKey.trim();
    if (legacyKey) {
      const synthesizedId = "legacy-default";
      base.providers.openrouter.apiKeys = [
        {
          id: synthesizedId,
          name: "Default key",
          key: base.providers.openrouter.apiKey,
          hasKey: true,
          createdAt: new Date().toISOString(),
        },
      ];
      base.providers.openrouter.activeApiKeyId = synthesizedId;
    }
  }

  if (base.providers.openrouter.apiKeys && base.providers.openrouter.apiKeys.length > 0) {
    const hasActive = base.providers.openrouter.activeApiKeyId
      ? base.providers.openrouter.apiKeys.some(
          (entry) => entry.id === base.providers.openrouter.activeApiKeyId,
        )
      : false;
    if (!hasActive) {
      base.providers.openrouter.activeApiKeyId = base.providers.openrouter.apiKeys[0]!.id;
    }
    const activeKey = getActiveApiKeyFromList(base.providers.openrouter);
    if (activeKey) {
      base.providers.openrouter.apiKey = activeKey;
    }
  }

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
  activeApiKeyId: provider.activeApiKeyId ?? null,
  apiKey: provider.apiKey,
  apiKeys: (provider.apiKeys ?? []).map((entry) => ({
    createdAt: entry.createdAt,
    id: entry.id,
    key: entry.key,
    name: entry.name,
  })),
  customModels: [...(provider.customModels ?? [])],
  deletedModels: [...(provider.deletedModels ?? [])],
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
        apiKeys: (normalized.providers.openrouter.apiKeys ?? []).map((entry) => ({
          createdAt: entry.createdAt,
          hasKey: entry.key.trim().length > 0,
          id: entry.id,
          key: "",
          name: entry.name,
        })),
        clearApiKey: false,
        hasApiKey:
          (normalized.providers.openrouter.apiKeys ?? []).some(
            (entry) => entry.key.trim().length > 0,
          ) || normalized.providers.openrouter.apiKey.trim().length > 0,
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

const resolveMergedApiKeys = (
  current: OpenRouterProviderSettings,
  incoming: OpenRouterProviderSettings,
  incomingRaw: Partial<OpenRouterProviderSettings> | undefined,
) => {
  const currentById = new Map((current.apiKeys ?? []).map((entry) => [entry.id, entry]));
  const incomingKeys = incoming.apiKeys ?? [];
  const now = new Date().toISOString();

  const mergedFromIncoming = incomingKeys
    .map((entry, index) => {
      const existing = currentById.get(entry.id);
      const incomingRawEntry = Array.isArray(incomingRaw?.apiKeys)
        ? incomingRaw?.apiKeys.find((item) => item && typeof item === "object" && item.id === entry.id)
        : undefined;
      const incomingKey = entry.key.trim();
      const shouldPreserveExisting =
        incomingKey.length === 0 &&
        existing &&
        ((incomingRawEntry as { hasKey?: boolean } | undefined)?.hasKey === true ||
          incomingRawEntry !== undefined);

      const key = incomingKey.length > 0 ? entry.key : shouldPreserveExisting ? existing.key : "";
      if (key.trim().length === 0) {
        return null;
      }
      return {
        createdAt: existing?.createdAt ?? entry.createdAt ?? now,
        id: entry.id,
        key,
        name: entry.name.trim() || existing?.name || `OpenRouter key ${index + 1}`,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (mergedFromIncoming.length > 0) {
    return mergedFromIncoming;
  }

  // If caller explicitly sent apiKeys but they resolved to empty, respect that as clear-all.
  if (incomingRaw && Object.prototype.hasOwnProperty.call(incomingRaw, "apiKeys")) {
    return [];
  }

  return current.apiKeys ?? [];
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
  const clearOpenRouterApiKey = nextProviders?.openrouter?.clearApiKey === true;

  const incomingOpenRouterRaw = nextProviders?.openrouter;
  const mergedApiKeys = clearOpenRouterApiKey
    ? []
    : hasIncomingProvider("openrouter")
      ? resolveMergedApiKeys(
          currentNormalized.providers.openrouter,
          incomingNormalized.providers.openrouter,
          incomingOpenRouterRaw,
        )
      : (currentNormalized.providers.openrouter.apiKeys ?? []);

  const mergedActiveApiKeyId = clearOpenRouterApiKey
    ? null
    : hasIncomingProvider("openrouter")
      ? (() => {
          const candidate =
            typeof incomingOpenRouterRaw?.activeApiKeyId === "string"
              ? incomingOpenRouterRaw.activeApiKeyId.trim()
              : "";
          if (candidate && mergedApiKeys.some((entry) => entry.id === candidate)) return candidate;
          const currentActive = currentNormalized.providers.openrouter.activeApiKeyId ?? "";
          if (currentActive && mergedApiKeys.some((entry) => entry.id === currentActive)) {
            return currentActive;
          }
          return mergedApiKeys[0]?.id ?? null;
        })()
      : (currentNormalized.providers.openrouter.activeApiKeyId ?? mergedApiKeys[0]?.id ?? null);

  const mergedSingleApiKey = clearOpenRouterApiKey
    ? ""
    : mergedApiKeys.find((entry) => entry.id === mergedActiveApiKeyId)?.key ??
      mergedApiKeys[0]?.key ??
      resolveMergedApiKey(
        currentNormalized.providers.openrouter.apiKey,
        nextProviders?.openrouter?.apiKey,
        nextProviders?.openrouter?.clearApiKey,
      );

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
        activeApiKeyId: mergedActiveApiKeyId,
        apiKey: mergedSingleApiKey,
        apiKeys: mergedApiKeys,
        customModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.customModels
          : currentNormalized.providers.openrouter.customModels,
        deletedModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.deletedModels
          : currentNormalized.providers.openrouter.deletedModels,
        enabledModels: hasIncomingProvider("openrouter")
          ? incomingNormalized.providers.openrouter.enabledModels
          : currentNormalized.providers.openrouter.enabledModels,
      },
    },
  });
};
