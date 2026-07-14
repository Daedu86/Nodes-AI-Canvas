"use client";
import React from "react";
import type { LlmProviderId } from "@/lib/llm/provider-catalog";
import { type LlmSettingsState } from "@/lib/llm/user-settings";
const createProviderApiKeyId = (prefix: string) => {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
        throw new Error("Secure random number generation is unavailable.");
    }
    if (typeof cryptoApi.randomUUID === "function") {
        return cryptoApi.randomUUID();
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const randomId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${randomId}`;
};
type UseLlmSettingsActionsOptions = {
    persistSettingsImmediately: (settings: LlmSettingsState) => void;
    setSettings: React.Dispatch<React.SetStateAction<LlmSettingsState>>;
};
export function useLlmSettingsActions({ persistSettingsImmediately, setSettings, }: UseLlmSettingsActionsOptions) {
    const setProviderApiKey = React.useCallback((provider: "openrouter", value: string) => {
        const trimmed = value.trim();
        setSettings((current) => ({
            providers: (() => {
                const currentProvider = current.providers[provider];
                const currentKeys = currentProvider.apiKeys ?? [];
                let nextKeys = currentKeys;
                let nextActiveId = currentProvider.activeApiKeyId ?? null;
                if (trimmed.length > 0) {
                    if (nextActiveId) {
                        nextKeys = currentKeys.map((entry) => entry.id === nextActiveId ? { ...entry, key: value } : entry);
                    }
                    else {
                        const newId = createProviderApiKeyId("or-key");
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
    }, [setSettings]);
    const clearProviderApiKey = React.useCallback((provider: "openrouter") => {
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
    }, [setSettings]);
    const addOpenRouterApiKey = React.useCallback((name: string, key: string) => {
        const trimmedKey = key.trim();
        if (!trimmedKey)
            return;
        const trimmedName = name.trim();
        setSettings((current) => {
            const currentKeys = current.providers.openrouter.apiKeys ?? [];
            const next = [
                ...currentKeys,
                {
                    createdAt: new Date().toISOString(),
                    id: createProviderApiKeyId("or-key"),
                    key: trimmedKey,
                    name: trimmedName || `OpenRouter key ${currentKeys.length + 1}`,
                },
            ];
            const activeApiKeyId = current.providers.openrouter.activeApiKeyId ?? next[0]?.id ?? null;
            const activeKey = next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
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
    }, [setSettings]);
    const removeOpenRouterApiKey = React.useCallback((id: string) => {
        setSettings((current) => {
            const next = (current.providers.openrouter.apiKeys ?? []).filter((entry) => entry.id !== id);
            const activeApiKeyId = current.providers.openrouter.activeApiKeyId === id
                ? (next[0]?.id ?? null)
                : current.providers.openrouter.activeApiKeyId ?? (next[0]?.id ?? null);
            const activeKey = next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
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
    }, [setSettings]);
    const setActiveOpenRouterApiKey = React.useCallback((id: string) => {
        setSettings((current) => {
            const keys = current.providers.openrouter.apiKeys ?? [];
            const active = keys.find((entry) => entry.id === id);
            if (!active)
                return current;
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
    }, [setSettings]);
    const addOllamaApiKey = React.useCallback((name: string, key: string) => {
        const trimmedKey = key.trim();
        if (!trimmedKey)
            return;
        const trimmedName = name.trim();
        setSettings((current) => {
            const currentKeys = current.providers.ollama.apiKeys ?? [];
            const next = [
                ...currentKeys,
                {
                    createdAt: new Date().toISOString(),
                    id: createProviderApiKeyId("ollama-key"),
                    key: trimmedKey,
                    name: trimmedName || `Ollama key ${currentKeys.length + 1}`,
                },
            ];
            const activeApiKeyId = current.providers.ollama.activeApiKeyId ?? next[0]?.id ?? null;
            const activeKey = next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
            return {
                providers: {
                    ...current.providers,
                    ollama: {
                        ...current.providers.ollama,
                        activeApiKeyId,
                        apiKey: activeKey,
                        apiKeys: next,
                        clearApiKey: false,
                        hasApiKey: true,
                    },
                },
            };
        });
    }, [setSettings]);
    const removeOllamaApiKey = React.useCallback((id: string) => {
        setSettings((current) => {
            const next = (current.providers.ollama.apiKeys ?? []).filter((entry) => entry.id !== id);
            const activeApiKeyId = current.providers.ollama.activeApiKeyId === id
                ? (next[0]?.id ?? null)
                : current.providers.ollama.activeApiKeyId ?? (next[0]?.id ?? null);
            const activeKey = next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
            return {
                providers: {
                    ...current.providers,
                    ollama: {
                        ...current.providers.ollama,
                        activeApiKeyId,
                        apiKey: activeKey,
                        apiKeys: next,
                        clearApiKey: next.length === 0,
                        hasApiKey: next.length > 0,
                    },
                },
            };
        });
    }, [setSettings]);
    const setActiveOllamaApiKey = React.useCallback((id: string) => {
        setSettings((current) => {
            const keys = current.providers.ollama.apiKeys ?? [];
            const active = keys.find((entry) => entry.id === id);
            if (!active)
                return current;
            return {
                providers: {
                    ...current.providers,
                    ollama: {
                        ...current.providers.ollama,
                        activeApiKeyId: id,
                        apiKey: active.key,
                        clearApiKey: false,
                        hasApiKey: true,
                    },
                },
            };
        });
    }, [setSettings]);
    const setProviderEnabled = React.useCallback((provider: Exclude<LlmProviderId, "openrouter">, value: boolean) => {
        setSettings((current) => ({
            providers: {
                ...current.providers,
                [provider]: {
                    ...current.providers[provider],
                    enabled: value,
                },
            },
        }));
    }, [setSettings]);
    const addOpenRouterCustomModel = React.useCallback((modelId: string) => {
        const trimmed = modelId.trim();
        if (!trimmed)
            return;
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
    }, [setSettings]);
    const deleteOpenRouterBuiltinModel = React.useCallback((modelId: string) => {
        const trimmed = modelId.trim();
        if (!trimmed)
            return;
        setSettings((current) => {
            const next = {
                providers: {
                    ...current.providers,
                    openrouter: {
                        ...current.providers.openrouter,
                        deletedModels: [
                            ...new Set([...(current.providers.openrouter.deletedModels ?? []), trimmed]),
                        ],
                        enabledModels: current.providers.openrouter.enabledModels.filter((entry) => entry !== trimmed),
                    },
                },
            };
            persistSettingsImmediately(next);
            return next;
        });
    }, [persistSettingsImmediately, setSettings]);
    const restoreOpenRouterBuiltinModel = React.useCallback((modelId: string) => {
        const trimmed = modelId.trim();
        if (!trimmed)
            return;
        setSettings((current) => {
            const deletedModels = (current.providers.openrouter.deletedModels ?? []).filter((entry) => entry !== trimmed);
            const enabledModels = current.providers.openrouter.enabledModels.includes(trimmed)
                ? current.providers.openrouter.enabledModels
                : [...current.providers.openrouter.enabledModels, trimmed];
            const next = {
                providers: {
                    ...current.providers,
                    openrouter: {
                        ...current.providers.openrouter,
                        deletedModels,
                        enabledModels,
                    },
                },
            };
            persistSettingsImmediately(next);
            return next;
        });
    }, [persistSettingsImmediately, setSettings]);
    const removeOpenRouterCustomModel = React.useCallback((modelId: string) => {
        const trimmed = modelId.trim();
        if (!trimmed)
            return;
        setSettings((current) => ({
            providers: {
                ...current.providers,
                openrouter: {
                    ...current.providers.openrouter,
                    customModels: (current.providers.openrouter.customModels ?? []).filter((entry) => entry !== trimmed),
                },
            },
        }));
    }, [setSettings]);
    const setProviderModels = React.useCallback((provider: Exclude<LlmProviderId, "openrouter">, value: string) => {
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
    }, [setSettings]);
    const setProviderValue = React.useCallback((provider: "ollama", field: "baseUrl", value: string) => {
        setSettings((current) => ({
            providers: {
                ...current.providers,
                [provider]: {
                    ...current.providers[provider],
                    [field]: value,
                },
            },
        }));
    }, [setSettings]);
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
                        enabledModels: enabledModels.length > 0
                            ? enabledModels
                            : current.providers.openrouter.enabledModels,
                    },
                },
            };
        });
    }, [setSettings]);
    return {
        setProviderApiKey,
        clearProviderApiKey,
        addOpenRouterApiKey,
        removeOpenRouterApiKey,
        setActiveOpenRouterApiKey,
        addOllamaApiKey,
        removeOllamaApiKey,
        setActiveOllamaApiKey,
        setProviderEnabled,
        addOpenRouterCustomModel,
        deleteOpenRouterBuiltinModel,
        restoreOpenRouterBuiltinModel,
        removeOpenRouterCustomModel,
        setProviderModels,
        setProviderValue,
        toggleOpenRouterModel,
    };
}
