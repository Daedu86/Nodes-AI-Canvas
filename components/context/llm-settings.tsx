"use client";

import React from "react";
import { useSession } from "next-auth/react";
import type { ModelConfig } from "@/components/context/model-config";
import {
  DEFAULT_OLLAMA_MODELS,
  OPENROUTER_FREE_MODEL_OPTIONS,
  normalizeEditableModelList,
  type LlmProviderId,
} from "@/lib/llm/provider-catalog";
import { getProviderOverrideHeaders, type LlmRequestOverrides } from "@/lib/llm/request-overrides";
import {
  BUILTIN_MODEL_OPTIONS,
  createDynamicModelOptions,
  dedupeModelOptions,
  getSupportedModelConfig as getSupportedModelConfigFromOptions,
  type ModelOption,
} from "@/lib/model-options";

type ProviderWithApiKey = "anthropic" | "google" | "openai";

type ApiProviderSettings = {
  apiKey: string;
  enabled: boolean;
  models: string[];
};

type OllamaProviderSettings = {
  baseUrl: string;
  enabled: boolean;
  models: string[];
};

type OpenRouterProviderSettings = {
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

type LlmSettingsContextValue = {
  availableModelOptions: ModelOption[];
  getProviderHeaders: (provider?: string | null) => Record<string, string>;
  getSupportedModelConfig: (config?: Partial<ModelConfig> | null) => ModelConfig;
  settings: LlmSettingsState;
  setProviderApiKey: (provider: ProviderWithApiKey | "openrouter", value: string) => void;
  setProviderEnabled: (provider: Exclude<LlmProviderId, "openrouter">, value: boolean) => void;
  setProviderModels: (provider: Exclude<LlmProviderId, "openrouter">, value: string) => void;
  setProviderValue: (
    provider: "ollama",
    field: "baseUrl",
    value: string,
  ) => void;
  toggleOpenRouterModel: (modelId: string) => void;
};

const LlmSettingsContext = React.createContext<LlmSettingsContextValue | null>(null);

const DEFAULT_STATE: LlmSettingsState = {
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

const cloneDefaultState = (): LlmSettingsState => ({
  providers: {
    anthropic: { ...DEFAULT_STATE.providers.anthropic, models: [] },
    google: { ...DEFAULT_STATE.providers.google, models: [] },
    ollama: { ...DEFAULT_STATE.providers.ollama, models: [...DEFAULT_STATE.providers.ollama.models] },
    openai: { ...DEFAULT_STATE.providers.openai, models: [] },
    openrouter: {
      ...DEFAULT_STATE.providers.openrouter,
      enabledModels: [...DEFAULT_STATE.providers.openrouter.enabledModels],
    },
  },
});

const normalizeState = (input: Partial<LlmSettingsState> | null | undefined): LlmSettingsState => {
  const base = cloneDefaultState();
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
    enabledModels: openrouterModels.length > 0 ? openrouterModels : base.providers.openrouter.enabledModels,
  };

  const normalizeApiProvider = (provider: ApiProviderSettings | undefined, fallback: ApiProviderSettings) => ({
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
    enabled: providers.ollama?.enabled !== undefined ? providers.ollama.enabled : base.providers.ollama.enabled,
    models: normalizeEditableModelList(providers.ollama?.models ?? base.providers.ollama.models),
  };
  if (base.providers.ollama.models.length === 0) {
    base.providers.ollama.models = [...DEFAULT_OLLAMA_MODELS];
  }

  return base;
};

const readSettings = (storageKey: string) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return cloneDefaultState();
    return normalizeState(JSON.parse(raw) as Partial<LlmSettingsState>);
  } catch {
    return cloneDefaultState();
  }
};

const createProviderHeadersFromSettings = (
  provider: string | null | undefined,
  settings: LlmSettingsState,
) => {
  const overrides: LlmRequestOverrides = {
    anthropicApiKey: settings.providers.anthropic.apiKey.trim() || undefined,
    googleApiKey: settings.providers.google.apiKey.trim() || undefined,
    ollamaBaseUrl: settings.providers.ollama.baseUrl.trim() || undefined,
    openaiApiKey: settings.providers.openai.apiKey.trim() || undefined,
    openrouterApiKey: settings.providers.openrouter.apiKey.trim() || undefined,
  };
  return getProviderOverrideHeaders(provider, overrides);
};

const buildAvailableModelOptions = (settings: LlmSettingsState) => {
  const options: ModelOption[] = [];

  const enabledOpenRouterIds = new Set(settings.providers.openrouter.enabledModels);
  options.push(
    ...OPENROUTER_FREE_MODEL_OPTIONS.filter((option) => enabledOpenRouterIds.has(option.modelId)),
  );

  if (settings.providers.ollama.enabled) {
    options.push(...createDynamicModelOptions("ollama", settings.providers.ollama.models));
  }

  const addApiProvider = (provider: ProviderWithApiKey) => {
    const entry = settings.providers[provider];
    if (!entry.enabled || !entry.apiKey.trim()) return;
    options.push(...createDynamicModelOptions(provider, entry.models));
  };

  addApiProvider("openai");
  addApiProvider("anthropic");
  addApiProvider("google");

  const deduped = dedupeModelOptions(options);
  return deduped.length > 0 ? deduped : BUILTIN_MODEL_OPTIONS;
};

export function LlmSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const storageKey = React.useMemo(
    () => `nodes.llm-settings.v1:${session?.user?.id ?? "guest"}`,
    [session?.user?.id],
  );
  const [settings, setSettings] = React.useState<LlmSettingsState>(cloneDefaultState);
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
    const next = readSettings(storageKey);
    hasLoadedRef.current = true;
    setSettings(next);
  }, [storageKey]);

  React.useEffect(() => {
    if (!hasLoadedRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings, storageKey]);

  const availableModelOptions = React.useMemo(
    () => buildAvailableModelOptions(settings),
    [settings],
  );

  const setProviderApiKey = React.useCallback(
    (provider: ProviderWithApiKey | "openrouter", value: string) => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            apiKey: value,
          },
        },
      }));
    },
    [],
  );

  const setProviderEnabled = React.useCallback(
    (provider: Exclude<LlmProviderId, "openrouter">, value: boolean) => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            enabled: value,
          },
        },
      }));
    },
    [],
  );

  const setProviderModels = React.useCallback(
    (provider: Exclude<LlmProviderId, "openrouter">, value: string) => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            models: normalizeEditableModelList(value),
          },
        },
      }));
    },
    [],
  );

  const setProviderValue = React.useCallback(
    (provider: "ollama", field: "baseUrl", value: string) => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            [field]: value,
          },
        },
      }));
    },
    [],
  );

  const toggleOpenRouterModel = React.useCallback((modelId: string) => {
    setSettings((current) => {
      const enabledModels = current.providers.openrouter.enabledModels.includes(modelId)
        ? current.providers.openrouter.enabledModels.filter((entry) => entry !== modelId)
        : [...current.providers.openrouter.enabledModels, modelId];

      return {
        providers: {
          ...current.providers,
          openrouter: {
            ...current.providers.openrouter,
            enabledModels:
              enabledModels.length > 0
                ? enabledModels
                : current.providers.openrouter.enabledModels,
          },
        },
      };
    });
  }, []);

  const getProviderHeaders = React.useCallback(
    (provider?: string | null) => createProviderHeadersFromSettings(provider, settings),
    [settings],
  );

  const getSupportedModelConfig = React.useCallback(
    (config?: Partial<ModelConfig> | null) =>
      getSupportedModelConfigFromOptions(config, availableModelOptions),
    [availableModelOptions],
  );

  const value = React.useMemo<LlmSettingsContextValue>(
    () => ({
      availableModelOptions,
      getProviderHeaders,
      getSupportedModelConfig,
      settings,
      setProviderApiKey,
      setProviderEnabled,
      setProviderModels,
      setProviderValue,
      toggleOpenRouterModel,
    }),
    [
      availableModelOptions,
      getProviderHeaders,
      getSupportedModelConfig,
      settings,
      setProviderApiKey,
      setProviderEnabled,
      setProviderModels,
      setProviderValue,
      toggleOpenRouterModel,
    ],
  );

  return <LlmSettingsContext.Provider value={value}>{children}</LlmSettingsContext.Provider>;
}

export function useLlmSettings() {
  const context = React.useContext(LlmSettingsContext);
  if (!context) {
    throw new Error("useLlmSettings must be used within LlmSettingsProvider");
  }
  return context;
}
