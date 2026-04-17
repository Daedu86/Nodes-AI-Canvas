"use client";

import React from "react";
import { useSession } from "next-auth/react";
import type { ModelConfig } from "@/components/context/model-config";
import type { LlmProviderId } from "@/lib/llm/provider-catalog";
import {
  cloneDefaultLlmSettingsState,
  normalizeLlmSettingsState,
  type LlmSettingsState,
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
  policy?: {
    openrouter?: {
      hasDeploymentKey?: boolean;
      requireUserKey?: boolean;
    };
  };
};

type LlmSettingsContextValue = {
  availableModelOptions: ModelOption[];
  getSupportedModelConfig: (config?: Partial<ModelConfig> | null) => ModelConfig;
  isReady: boolean;
  settings: LlmSettingsState;
  policy: {
    openrouter: {
      hasDeploymentKey: boolean;
      requireUserKey: boolean;
    };
  };
  clearProviderApiKey: (provider: "openrouter") => void;
  setProviderApiKey: (provider: "openrouter", value: string) => void;
  addOpenRouterApiKey: (name: string, key: string) => void;
  removeOpenRouterApiKey: (id: string) => void;
  setActiveOpenRouterApiKey: (id: string) => void;
  addOpenRouterCustomModel: (modelId: string) => void;
  deleteOpenRouterBuiltinModel: (modelId: string) => void;
  removeOpenRouterCustomModel: (modelId: string) => void;
  restoreOpenRouterBuiltinModel: (modelId: string) => void;
  setProviderEnabled: (provider: Exclude<LlmProviderId, "openrouter">, value: boolean) => void;
  setProviderModels: (provider: Exclude<LlmProviderId, "openrouter">, value: string) => void;
  setProviderValue: (provider: "ollama", field: "baseUrl", value: string) => void;
  toggleOpenRouterModel: (modelId: string) => void;
};

const LlmSettingsContext = React.createContext<LlmSettingsContextValue | null>(null);

const LEGACY_STORAGE_KEY_PREFIX = "nodes.llm-settings.v1:";
const SAVE_DEBOUNCE_MS = 450;

const createOpenRouterApiKeyId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `or-key-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

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
  const deletedOpenRouterIds = new Set(settings.providers.openrouter.deletedModels ?? []);
  options.push(
    ...BUILTIN_MODEL_OPTIONS.filter(
      (option) =>
        option.provider === "openrouter" &&
        enabledOpenRouterIds.has(option.modelId) &&
        !deletedOpenRouterIds.has(option.modelId),
    ),
  );

  if ((settings.providers.openrouter.customModels ?? []).length > 0) {
    options.push(
      ...createDynamicModelOptions("openrouter", settings.providers.openrouter.customModels ?? []),
    );
  }

  if (settings.providers.ollama.enabled) {
    options.push(...createDynamicModelOptions("ollama", settings.providers.ollama.models));
  }

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
  return {
    settings: data.settings ? normalizeLlmSettingsState(data.settings) : null,
    policy: {
      openrouter: {
        hasDeploymentKey: Boolean(data.policy?.openrouter?.hasDeploymentKey),
        requireUserKey: Boolean(data.policy?.openrouter?.requireUserKey),
      },
    },
  };
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
  return {
    settings: normalizeLlmSettingsState(data.settings),
    policy: {
      openrouter: {
        hasDeploymentKey: Boolean(data.policy?.openrouter?.hasDeploymentKey),
        requireUserKey: Boolean(data.policy?.openrouter?.requireUserKey),
      },
    },
  };
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
  const [policy, setPolicy] = React.useState({
    openrouter: {
      hasDeploymentKey: false,
      requireUserKey: false,
    },
  });
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
      setPolicy({
        openrouter: {
          hasDeploymentKey: false,
          requireUserKey: false,
        },
      });
      persistedSignatureRef.current = JSON.stringify(next);
      setIsReady(true);
      return;
    }

    let cancelled = false;
    setIsReady(false);

    void (async () => {
      let next = cloneDefaultLlmSettingsState();
      let migrateLegacy = false;
      let legacyPayload: LlmSettingsState | null = null;

      try {
        const remote = await fetchLlmSettings();
        if (remote.settings) {
          next = remote.settings;
          setPolicy(remote.policy);
        } else {
          const legacy = readLegacySettings(legacyStorageKey);
          if (legacy) {
            // Never show a legacy key in the UI, but migrate it to server storage when present.
            const legacyKey = legacy.providers.openrouter.apiKey.trim();
            if (legacyKey) {
              legacyPayload = legacy;
              next = {
                ...legacy,
                providers: {
                  ...legacy.providers,
                  openrouter: {
                    ...legacy.providers.openrouter,
                    apiKey: "",
                    clearApiKey: false,
                    hasApiKey: true,
                  },
                },
              };
            } else {
              next = legacy;
              legacyPayload = legacy;
            }
            migrateLegacy = true;
          }
        }
      } catch (error) {
        console.error("Failed to load LLM settings", error);
        const legacy = readLegacySettings(legacyStorageKey);
        if (legacy) {
          const legacyKey = legacy.providers.openrouter.apiKey.trim();
          if (legacyKey) {
            legacyPayload = legacy;
            next = {
              ...legacy,
              providers: {
                ...legacy.providers,
                openrouter: {
                  ...legacy.providers.openrouter,
                  apiKey: "",
                  clearApiKey: false,
                  hasApiKey: true,
                },
              },
            };
          } else {
            next = legacy;
            legacyPayload = legacy;
          }
          migrateLegacy = true;
        }
      }

      if (cancelled) return;

      const signature = JSON.stringify(next);
      setSettings(next);
      persistedSignatureRef.current = signature;
      setIsReady(true);

      if (migrateLegacy) {
        void persistLlmSettings(legacyPayload ?? next)
          .then((saved) => {
            if (cancelled) return;
            persistedSignatureRef.current = JSON.stringify(saved.settings);
            setPolicy(saved.policy);
            if (JSON.stringify(latestSettingsRef.current) === signature) {
              setSettings(saved.settings);
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
          const savedSignature = JSON.stringify(saved.settings);
          persistedSignatureRef.current = savedSignature;
          if (JSON.stringify(latestSettingsRef.current) === pendingSignature) {
            setSettings(saved.settings);
          }
          setPolicy(saved.policy);
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
    (provider: "openrouter", value: string) => {
      const trimmed = value.trim();
      setSettings((current) => ({
        providers: (() => {
          const currentProvider = current.providers[provider];
          const currentKeys = currentProvider.apiKeys ?? [];
          let nextKeys = currentKeys;
          let nextActiveId = currentProvider.activeApiKeyId ?? null;

          if (trimmed.length > 0) {
            if (nextActiveId) {
              nextKeys = currentKeys.map((entry) =>
                entry.id === nextActiveId ? { ...entry, key: value } : entry,
              );
            } else {
              const newId = createOpenRouterApiKeyId();
              nextKeys = [
                ...currentKeys,
                {
                  createdAt: new Date().toISOString(),
                  id: newId,
                  key: value,
                  name: `OpenRouter key ${currentKeys.length + 1}`,
                },
              ];
              nextActiveId = newId;
            }
          }

          return {
            ...current.providers,
            [provider]: {
              ...currentProvider,
              activeApiKeyId: nextActiveId,
              apiKey: value,
              apiKeys: nextKeys,
              clearApiKey: false,
              hasApiKey: trimmed.length > 0 || nextKeys.length > 0,
            },
          };
        })(),
      }));
    },
    [],
  );

  const clearProviderApiKey = React.useCallback(
    (provider: "openrouter") => {
      setSettings((current) => ({
        providers: {
          ...current.providers,
          [provider]: {
            ...current.providers[provider],
            activeApiKeyId: null,
            apiKey: "",
            apiKeys: [],
            clearApiKey: true,
            hasApiKey: false,
          },
        },
      }));
    },
    [],
  );

  const addOpenRouterApiKey = React.useCallback((name: string, key: string) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const trimmedName = name.trim();
    setSettings((current) => {
      const currentKeys = current.providers.openrouter.apiKeys ?? [];
      const next = [
        ...currentKeys,
        {
          createdAt: new Date().toISOString(),
          id: createOpenRouterApiKeyId(),
          key: trimmedKey,
          name: trimmedName || `OpenRouter key ${currentKeys.length + 1}`,
        },
      ];
      const activeApiKeyId = current.providers.openrouter.activeApiKeyId ?? next[0]?.id ?? null;
      const activeKey =
        next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
      return {
        providers: {
          ...current.providers,
          openrouter: {
            ...current.providers.openrouter,
            activeApiKeyId,
            apiKey: activeKey,
            apiKeys: next,
            clearApiKey: false,
            hasApiKey: true,
          },
        },
      };
    });
  }, []);

  const removeOpenRouterApiKey = React.useCallback((id: string) => {
    setSettings((current) => {
      const next = (current.providers.openrouter.apiKeys ?? []).filter((entry) => entry.id !== id);
      const activeApiKeyId =
        current.providers.openrouter.activeApiKeyId === id
          ? (next[0]?.id ?? null)
          : current.providers.openrouter.activeApiKeyId ?? (next[0]?.id ?? null);
      const activeKey =
        next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
      return {
        providers: {
          ...current.providers,
          openrouter: {
            ...current.providers.openrouter,
            activeApiKeyId,
            apiKey: activeKey,
            apiKeys: next,
            clearApiKey: next.length === 0,
            hasApiKey: next.length > 0,
          },
        },
      };
    });
  }, []);

  const setActiveOpenRouterApiKey = React.useCallback((id: string) => {
    setSettings((current) => {
      const keys = current.providers.openrouter.apiKeys ?? [];
      const active = keys.find((entry) => entry.id === id);
      if (!active) return current;
      return {
        providers: {
          ...current.providers,
          openrouter: {
            ...current.providers.openrouter,
            activeApiKeyId: id,
            apiKey: active.key,
            clearApiKey: false,
            hasApiKey: true,
          },
        },
      };
    });
  }, []);

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

  const addOpenRouterCustomModel = React.useCallback((modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setSettings((current) => ({
      providers: {
        ...current.providers,
        openrouter: {
          ...current.providers.openrouter,
          customModels: [
            ...new Set([...(current.providers.openrouter.customModels ?? []), trimmed]),
          ],
        },
      },
    }));
  }, []);

  const deleteOpenRouterBuiltinModel = React.useCallback((modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setSettings((current) => ({
      providers: {
        ...current.providers,
        openrouter: {
          ...current.providers.openrouter,
          deletedModels: [
            ...new Set([...(current.providers.openrouter.deletedModels ?? []), trimmed]),
          ],
          enabledModels: current.providers.openrouter.enabledModels.filter(
            (entry) => entry !== trimmed,
          ),
        },
      },
    }));
  }, []);

  const restoreOpenRouterBuiltinModel = React.useCallback((modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setSettings((current) => {
      const deletedModels = (current.providers.openrouter.deletedModels ?? []).filter(
        (entry) => entry !== trimmed,
      );
      const enabledModels = current.providers.openrouter.enabledModels.includes(trimmed)
        ? current.providers.openrouter.enabledModels
        : [...current.providers.openrouter.enabledModels, trimmed];

      return {
        providers: {
          ...current.providers,
          openrouter: {
            ...current.providers.openrouter,
            deletedModels,
            enabledModels,
          },
        },
      };
    });
  }, []);

  const removeOpenRouterCustomModel = React.useCallback((modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    setSettings((current) => ({
      providers: {
        ...current.providers,
        openrouter: {
          ...current.providers.openrouter,
          customModels: (current.providers.openrouter.customModels ?? []).filter(
            (entry) => entry !== trimmed,
          ),
        },
      },
    }));
  }, []);

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
      policy,
      clearProviderApiKey,
      setProviderApiKey,
      addOpenRouterApiKey,
      removeOpenRouterApiKey,
      setActiveOpenRouterApiKey,
      addOpenRouterCustomModel,
      deleteOpenRouterBuiltinModel,
      removeOpenRouterCustomModel,
      restoreOpenRouterBuiltinModel,
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
      policy,
      clearProviderApiKey,
      setProviderApiKey,
      addOpenRouterApiKey,
      removeOpenRouterApiKey,
      setActiveOpenRouterApiKey,
      addOpenRouterCustomModel,
      deleteOpenRouterBuiltinModel,
      removeOpenRouterCustomModel,
      restoreOpenRouterBuiltinModel,
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
