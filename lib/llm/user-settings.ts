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
  activeApiKeyId?: string | null;
  apiKey?: string;
  apiKeys?: Array<{
    createdAt?: string;
    hasKey?: boolean;
    id: string;
    key: string;
    name: string;
  }>;
  baseUrl: string;
  clearApiKey?: boolean;
  enabled: boolean;
  hasApiKey?: boolean;
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
      activeApiKeyId: null,
      apiKey: "",
      apiKeys: [],
      baseUrl: "http://localhost:11434/api",
      clearApiKey: false,
      enabled: false,
      hasApiKey: false,
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
      activeApiKeyId: DEFAULT_LLM_SETTINGS_STATE.providers.ollama.activeApiKeyId ?? null,
      apiKey: DEFAULT_LLM_SETTINGS_STATE.providers.ollama.apiKey ?? "",
      apiKeys: [...(DEFAULT_LLM_SETTINGS_STATE.providers.ollama.apiKeys ?? [])],
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

const sanitizeApiKeyEntries = (value: unknown, fallbackName: string) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as {
        createdAt?: unknown;
        hasKey?: unknown;
        id?: unknown;
        key?: unknown;
        name?: unknown;
      };
      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${fallbackName}-${index}`;
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `${fallbackName} ${index + 1}`;
      return {
        createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
        hasKey: item.hasKey === true,
        id,
        key: typeof item.key === "string" ? item.key : "",
        name,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
};

const normalizeOpenRouterApiKeys = (value: unknown) =>
  sanitizeApiKeyEntries(value, "OpenRouter key");

const normalizeOllamaApiKeys = (value: unknown) =>
  sanitizeApiKeyEntries(value, "Ollama key");

const normalizeEditableModelListValue = (value: unknown, fallback: string[] = []) => {
  const normalized = normalizeEditableModelList(
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : typeof value === "string"
        ? value
        : fallback,
  );
  return normalized.length > 0 ? normalized : [...fallback];
};

export const normalizeLlmSettingsState = (
  input: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const base = cloneDefaultLlmSettingsState();
  const providers = input?.providers ?? {};

  base.providers.openrouter = {
    activeApiKeyId:
      typeof providers.openrouter?.activeApiKeyId === "string" &&
      providers.openrouter.activeApiKeyId.trim().length > 0
        ? providers.openrouter.activeApiKeyId.trim()
        : null,
    apiKey: typeof providers.openrouter?.apiKey === "string" ? providers.openrouter.apiKey : "",
    apiKeys: normalizeOpenRouterApiKeys(providers.openrouter?.apiKeys),
    clearApiKey: providers.openrouter?.clearApiKey === true,
    customModels: normalizeEditableModelListValue(providers.openrouter?.customModels, []),
    deletedModels: normalizeEditableModelListValue(providers.openrouter?.deletedModels, []),
    enabledModels: normalizeEditableModelListValue(
      providers.openrouter?.enabledModels,
      base.providers.openrouter.enabledModels,
    ).filter((modelId) => !base.providers.openrouter.deletedModels.includes(modelId)),
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
    activeApiKeyId:
      typeof providers.ollama?.activeApiKeyId === "string" &&
      providers.ollama.activeApiKeyId.trim().length > 0
        ? providers.ollama.activeApiKeyId.trim()
        : null,
    apiKey: typeof providers.ollama?.apiKey === "string" ? providers.ollama.apiKey : "",
    apiKeys: normalizeOllamaApiKeys(providers.ollama?.apiKeys),
    baseUrl:
      typeof providers.ollama?.baseUrl === "string"
        ? providers.ollama.baseUrl
        : base.providers.ollama.baseUrl,
    clearApiKey: providers.ollama?.clearApiKey === true,
    enabled:
      providers.ollama?.enabled !== undefined
        ? providers.ollama.enabled
        : base.providers.ollama.enabled,
    hasApiKey:
      providers.ollama?.hasApiKey !== undefined
        ? providers.ollama.hasApiKey
        : typeof providers.ollama?.apiKey === "string" &&
            providers.ollama.apiKey.trim().length > 0,
    models: normalizeEditableModelList(providers.ollama?.models ?? base.providers.ollama.models),
  };

  // Backward compatibility: when only a legacy single ollama apiKey exists, synthesize one key entry.
  if ((base.providers.ollama.apiKeys?.length ?? 0) === 0) {
    const legacyKey = base.providers.ollama.apiKey?.trim();
    if (legacyKey) {
      const synthesizedId = "legacy-default";
      base.providers.ollama.apiKeys = [
        {
          id: synthesizedId,
          name: "Default key",
          key: base.providers.ollama.apiKey ?? "",
          hasKey: true,
          createdAt: new Date().toISOString(),
        },
      ];
      base.providers.ollama.activeApiKeyId = synthesizedId;
    }
  }

  if (base.providers.ollama.apiKeys && base.providers.ollama.apiKeys.length > 0) {
    const hasActive = base.providers.ollama.activeApiKeyId
      ? base.providers.ollama.apiKeys.some(
          (entry) => entry.id === base.providers.ollama.activeApiKeyId,
        )
      : false;
    if (!hasActive) {
      base.providers.ollama.activeApiKeyId = base.providers.ollama.apiKeys[0]!.id;
    }
    const activeKey = getActiveOllamaApiKeyFromList(base.providers.ollama);
    if (activeKey) {
      base.providers.ollama.apiKey = activeKey;
    }
  }

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

const stripOllamaMetadata = (provider: OllamaProviderSettings): OllamaProviderSettings => ({
  activeApiKeyId: provider.activeApiKeyId ?? null,
  apiKey: provider.apiKey ?? "",
  apiKeys: (provider.apiKeys ?? []).map((entry) => ({
    createdAt: entry.createdAt,
    id: entry.id,
    key: entry.key,
    name: entry.name,
  })),
  baseUrl: provider.baseUrl,
  enabled: provider.enabled,
  models: [...provider.models],
});

export const stripLlmSettingsCredentialMetadata = (
  input: Partial<LlmSettingsState> | null | undefined,
): LlmSettingsState => {
  const normalized = normalizeLlmSettingsState(input);
  return {
    providers: {
      ollama: {
        ...stripOllamaMetadata(normalized.providers.ollama),
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
        ...stripOllamaMetadata(normalized.providers.ollama),
        apiKey: "",
        apiKeys: (normalized.providers.ollama.apiKeys ?? []).map((entry) => ({
          createdAt: entry.createdAt,
          hasKey: entry.key.trim().length > 0,
          id: entry.id,
          key: "",
          name: entry.name,
        })),
        clearApiKey: false,
        hasApiKey:
          (normalized.providers.ollama.apiKeys ?? []).some((entry) => entry.key.trim().length > 0) ||
          (normalized.providers.ollama.apiKey ?? "").trim().length > 0,
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

const getActiveApiKeyFromList = (provider: OpenRouterProviderSettings) => {
  const activeId = provider.activeApiKeyId ?? null;
  const entry =
    (activeId ? provider.apiKeys?.find((candidate) => candidate.id === activeId) : undefined) ??
    provider.apiKeys?.[0];
  return entry?.key?.trim() ? entry.key : "";
};

const getActiveOllamaApiKeyFromList = (provider: OllamaProviderSettings) => {
  const activeId = provider.activeApiKeyId ?? null;
  const entry =
    (activeId ? provider.apiKeys?.find((candidate) => candidate.id === activeId) : undefined) ??
    provider.apiKeys?.[0];
  return entry?.key?.trim() ? entry.key : "";
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

const resolveMergedOllamaApiKeys = (
  current: OllamaProviderSettings,
  incoming: OllamaProviderSettings,
  incomingRaw: Partial<OllamaProviderSettings> | undefined,
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
        name: entry.name.trim() || existing?.name || `Ollama key ${index + 1}`,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (mergedFromIncoming.length > 0) {
    return mergedFromIncoming;
  }

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
  const clearOllamaApiKey = nextProviders?.ollama?.clearApiKey === true;
  const clearOpenRouterApiKey = nextProviders?.openrouter?.clearApiKey === true;

  const incomingOllamaRaw = nextProviders?.ollama;
  const mergedOllamaApiKeys = clearOllamaApiKey
    ? []
    : hasIncomingProvider("ollama")
      ? resolveMergedOllamaApiKeys(
          currentNormalized.providers.ollama,
          incomingNormalized.providers.ollama,
          incomingOllamaRaw,
        )
      : (currentNormalized.providers.ollama.apiKeys ?? []);

  const mergedOllamaActiveApiKeyId = clearOllamaApiKey
    ? null
    : hasIncomingProvider("ollama")
      ? (() => {
          const candidate =
            typeof incomingOllamaRaw?.activeApiKeyId === "string"
              ? incomingOllamaRaw.activeApiKeyId.trim()
              : "";
          if (candidate && mergedOllamaApiKeys.some((entry) => entry.id === candidate)) {
            return candidate;
          }
          const currentActive = currentNormalized.providers.ollama.activeApiKeyId ?? "";
          if (currentActive && mergedOllamaApiKeys.some((entry) => entry.id === currentActive)) {
            return currentActive;
          }
          return mergedOllamaApiKeys[0]?.id ?? null;
        })()
      : (currentNormalized.providers.ollama.activeApiKeyId ?? mergedOllamaApiKeys[0]?.id ?? null);

  const mergedOllamaSingleApiKey = clearOllamaApiKey
    ? ""
    : mergedOllamaApiKeys.find((entry) => entry.id === mergedOllamaActiveApiKeyId)?.key ??
      mergedOllamaApiKeys[0]?.key ??
      resolveMergedApiKey(
        currentNormalized.providers.ollama.apiKey ?? "",
        nextProviders?.ollama?.apiKey,
        nextProviders?.ollama?.clearApiKey,
      );

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
        activeApiKeyId: mergedOllamaActiveApiKeyId,
        apiKey: mergedOllamaSingleApiKey,
        apiKeys: mergedOllamaApiKeys,
        baseUrl: hasIncomingProvider("ollama")
          ? incomingNormalized.providers.ollama.baseUrl
          : currentNormalized.providers.ollama.baseUrl,
        enabled: hasIncomingProvider("ollama")
          ? incomingNormalized.providers.ollama.enabled
          : currentNormalized.providers.ollama.enabled,
        hasApiKey: mergedOllamaSingleApiKey.trim().length > 0 || mergedOllamaApiKeys.length > 0,
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
