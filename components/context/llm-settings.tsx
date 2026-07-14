"use client";
import React from "react";
import type { ModelConfig } from "@/components/context/model-config";
import { type LlmSettingsPolicy } from "@/lib/client/llm-settings-client";
import type { LlmProviderId } from "@/lib/llm/provider-catalog";
import { type LlmSettingsState } from "@/lib/llm/user-settings";
import { getSupportedModelConfig as getSupportedModelConfigFromOptions, type ModelOption } from "@/lib/model-options";
import { buildAvailableModelOptions } from "@/components/context/llm-settings-model-options";
import { useLlmSettingsActions } from "@/components/context/use-llm-settings-actions";
import { useLlmSettingsPersistence } from "@/components/context/use-llm-settings-persistence";
type LlmSettingsContextValue = {
    availableModelOptions: ModelOption[];
    getSupportedModelConfig: (config?: Partial<ModelConfig> | null) => ModelConfig;
    hasUnsavedChanges: boolean;
    isReady: boolean;
    isSaving: boolean;
    lastSaveError: string | null;
    settings: LlmSettingsState;
    policy: LlmSettingsPolicy;
    saveSettingsNow: () => Promise<boolean>;
    clearProviderApiKey: (provider: "openrouter") => void;
    setProviderApiKey: (provider: "openrouter", value: string) => void;
    addOpenRouterApiKey: (name: string, key: string) => void;
    removeOpenRouterApiKey: (id: string) => void;
    setActiveOpenRouterApiKey: (id: string) => void;
    addOllamaApiKey: (name: string, key: string) => void;
    removeOllamaApiKey: (id: string) => void;
    setActiveOllamaApiKey: (id: string) => void;
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
export function LlmSettingsProvider({ children, }: {
    children: React.ReactNode;
}) {
    const { settings, setSettings, policy, isReady, isSaving, lastSaveError, persistSettingsImmediately, saveSettingsNow, hasUnsavedChanges, } = useLlmSettingsPersistence();
    const { setProviderApiKey, clearProviderApiKey, addOpenRouterApiKey, removeOpenRouterApiKey, setActiveOpenRouterApiKey, addOllamaApiKey, removeOllamaApiKey, setActiveOllamaApiKey, setProviderEnabled, addOpenRouterCustomModel, deleteOpenRouterBuiltinModel, restoreOpenRouterBuiltinModel, removeOpenRouterCustomModel, setProviderModels, setProviderValue, toggleOpenRouterModel, } = useLlmSettingsActions({ persistSettingsImmediately, setSettings });
    const availableModelOptions = React.useMemo(() => buildAvailableModelOptions(settings), [settings]);
    const getSupportedModelConfig = React.useCallback((config?: Partial<ModelConfig> | null) => getSupportedModelConfigFromOptions(config, availableModelOptions), [availableModelOptions]);
    const value = React.useMemo<LlmSettingsContextValue>(() => ({
        availableModelOptions,
        getSupportedModelConfig,
        hasUnsavedChanges,
        isReady,
        isSaving,
        lastSaveError,
        settings,
        policy,
        saveSettingsNow,
        clearProviderApiKey,
        setProviderApiKey,
        addOpenRouterApiKey,
        removeOpenRouterApiKey,
        setActiveOpenRouterApiKey,
        addOllamaApiKey,
        removeOllamaApiKey,
        setActiveOllamaApiKey,
        addOpenRouterCustomModel,
        deleteOpenRouterBuiltinModel,
        removeOpenRouterCustomModel,
        restoreOpenRouterBuiltinModel,
        setProviderEnabled,
        setProviderModels,
        setProviderValue,
        toggleOpenRouterModel,
    }), [
        availableModelOptions,
        getSupportedModelConfig,
        hasUnsavedChanges,
        isReady,
        isSaving,
        lastSaveError,
        settings,
        policy,
        saveSettingsNow,
        clearProviderApiKey,
        setProviderApiKey,
        addOpenRouterApiKey,
        removeOpenRouterApiKey,
        setActiveOpenRouterApiKey,
        addOllamaApiKey,
        removeOllamaApiKey,
        setActiveOllamaApiKey,
        addOpenRouterCustomModel,
        deleteOpenRouterBuiltinModel,
        removeOpenRouterCustomModel,
        restoreOpenRouterBuiltinModel,
        setProviderEnabled,
        setProviderModels,
        setProviderValue,
        toggleOpenRouterModel,
    ]);
    return <LlmSettingsContext.Provider value={value}>{children}</LlmSettingsContext.Provider>;
}
export function useLlmSettings() {
    const context = React.useContext(LlmSettingsContext);
    if (!context) {
        throw new Error("useLlmSettings must be used within LlmSettingsProvider");
    }
    return context;
}
