"use client";

import React from "react";
import { useSession } from "next-auth/react";
import type { ModelConfig } from "@/components/context/model-config";
import type { LlmProviderId } from "@/lib/llm/provider-catalog";
import {
  cloneDefaultLlmSettingsState,
  normalizeLlmSettingsState,
  type LlmSettingsState,
  type ProviderWithApiKey,
} from "@/lib/llm/user-settings";
import {
  BUILTIN_MODEL_OPTIONS,
  createDynamicModelOptions,
  dedupeModelOptions,
  getSupportedModelConfig as getSupportedModelConfigFromOptions,
  type ModelOption,
} from "@/lib/model-options";

type LlmSettingsResponse = {
  settings: LlmSettingsState | null;
};

type LlmSettingsContextValue = {
  availableModelOptions: ModelOption[];
  getSupportedModelConfig: (config?: Partial<ModelConfig> | null) => ModelConfig;
  isReady: boolean;
  settings: LlmSettingsState;
  clearProviderApiKey: (provider: ProviderWithApiKey | "openrouter") => void;
  setProviderApiKey: (provider: ProviderWithApiKey | "openrouter", value: string) => void;
  setProviderEnabled: (provider: Exclude<LlmProviderId, "openrouter">, value: boolean) => void;
  setProviderModels: (provider: Exclude<LlmProviderId, "openrouter">, value: string) => void;
  setProviderValue: (provider: "ollama", field: "baseUrl", value: string) => void;
  toggleOpenRouterModel: (modelId: string) => void;
};

const LlmSettingsContext = React.createContext<LlmSettingsContextValue | null>(null);

const LEGACY_STORAGE_KEY_PREFIX = "nodes.llm-settings.v1:";
const SAVE_DEBOUNCE_MS = 450;

const readLegacySettings = (storageKey: string) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return normalizeLlmSettingsState(JSON.parse(raw) as Partial<LlmSettingsState>);
  } catch {
    return null;
  }
};

const clearLegacySettings = (storageKey: string) => {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage errors
  }
};

const buildAvailableModelOptions = (settings: LlmSettingsState) => {
  const options: ModelOption[] = [];

  const enabledOpenRouterIds = new Set(settings.providers.openrouter.enabledModels);
  options.push(
    ...BUILTIN_MODEL_OPTIONS.filter(
      (option) =>
        option.provider === "openrouter" && enabledOpenRouterIds.has(option.modelId),
    ),
  );

  if (settings.providers.ollama.enabled) {
    options.push(...createDynamicModelOptions("ollama", settings.providers.ollama.models));
  }

  const addApiProvider = (provider: ProviderWithApiKey) => {
    const entry = settings.providers[provider];
    if (!entry.enabled || (!entry.apiKey.trim() && !entry.hasApiKey)) return;
    options.push(...createDynamicModelOptions(provider, entry.models));
  };

  addApiProvider("openai");
  addApiProvider("anthropic");
  addApiProvider("google");

  const deduped = dedupeModelOptions(options);
  return deduped.length > 0 ? deduped : BUILTIN_MODEL_OPTIONS;
};

async function fetchLlmSettings() {
  const response = await fetch("/api/llm/settings", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to load LLM settings: ${response.status}`);
  }
  const data = (await response.json()) as LlmSettingsResponse;
  return data.settings ? normalizeLlmSettingsState(data.settings) : null;
}

async function persistLlmSettings(settings: LlmSettingsState) {
  const response = await fetch("/api/llm/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      settings,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save LLM settings: ${response.status}`);
  }
  const data = (await response.json()) as LlmSettingsResponse;
  return normalizeLlmSettingsState(data.settings);
}

export function LlmSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const legacyStorageKey = React.useMemo(
    () => `${LEGACY_STORAGE_KEY_PREFIX}${userId ?? "guest"}`,
    [userId],
  );
  const [settings, setSettings] = React.useState<LlmSettingsState>(cloneDefaultLlmSettingsState);
  const [isReady, setIsReady] = React.useState(false);
  const persistedSignatureRef = React.useRef<string | null>(null);
  const latestSettingsRef = React.useRef<LlmSettingsState>(settings);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (status === "loading") {
      setIsReady(false);
      return;
    }

    if (!userId) {
      const next = cloneDefaultLlmSettingsState();
      setSettings(next);
      persistedSignatureRef.current = JSON.stringify(next);
      setIsReady(true);
      return;
    }

    let cancelled = false;
    setIsReady(false);

    void (async () => {
      let next = cloneDefaultLlmSettingsState();
      let migrateLegacy = false;

      try {
        const remote = await fetchLlmSettings();
        if (remote) {
          next = remote;
        } else {
          const legacy = readLegacySettings(legacyStorageKey);
          if (legacy) {
            next = legacy;
            migrateLegacy = true;
          }
        }
      } catch (error) {
        console.error("Failed to load LLM settings", error);
        const legacy = readLegacySettings(legacyStorageKey);
        if (legacy) {
          next = legacy;
          migrateLegacy = true;
        }
      }

      if (cancelled) return;

      const signature = JSON.stringify(next);
      setSettings(next);
      persistedSignatureRef.current = signature;
      setIsReady(true);

      if (migrateLegacy) {
        void persistLlmSettings(next)
          .then((saved) => {
            if (cancelled) return;
            persistedSignatureRef.current = JSON.stringify(saved);
            if (JSON.stringify(latestSettingsRef.current) === signature) {
              setSettings(saved);
            }
            clearLegacySettings(legacyStorageKey);
          })
          .catch((error) => {
            console.error("Failed to migrate legacy LLM settings", error);
          });
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [legacyStorageKey, status, userId]);

  React.useEffect(() => {
    if (!isReady || !userId) return;

    const signature = JSON.stringify(settings);
    if (signature === persistedSignatureRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      if (saveTimeoutRef.current === timeoutId) {
        saveTimeoutRef.current = null;
      }
      const pendingSignature = signature;
      void persistLlmSettings(settings)
        .then((saved) => {
          const savedSignature = JSON.stringify(saved);
          persistedSignatureRef.current = savedSignature;
          if (JSON.stringify(latestSettingsRef.current) === pendingSignature) {
            setSettings(saved);
          }
          clearLegacySettings(legacyStorageKey);
        })
        .catch((error) => {
          console.error("Failed to persist LLM settings", error);
        });
    }, SAVE_DEBOUNCE_MS);
    saveTimeoutRef.current = timeoutId;

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [isReady, legacyStorageKey, settings, userId]);

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
            clearApiKey: false,
            hasApiKey:
              value.trim().length > 0
                ? true
                : current.providers[provider].hasApiKey === true &&
                  current.providers[provider].clearApiKey !== true,
          },
        },
      }));
    },
    [],
  );

  const clearProviderApiKey = React.useCallback(
    (provider: ProviderWithApiKey | "openrouter") => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            apiKey: "",
            clearApiKey: true,
            hasApiKey: false,
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
      const nextModels = value
        .split(/[\n,]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            models: [...new Set(nextModels)],
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

  const getSupportedModelConfig = React.useCallback(
    (config?: Partial<ModelConfig> | null) =>
      getSupportedModelConfigFromOptions(config, availableModelOptions),
    [availableModelOptions],
  );

  const value = React.useMemo<LlmSettingsContextValue>(
    () => ({
      availableModelOptions,
      getSupportedModelConfig,
      isReady,
      settings,
      clearProviderApiKey,
      setProviderApiKey,
      setProviderEnabled,
      setProviderModels,
      setProviderValue,
      toggleOpenRouterModel,
    }),
    [
      availableModelOptions,
      getSupportedModelConfig,
      isReady,
      settings,
      clearProviderApiKey,
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
