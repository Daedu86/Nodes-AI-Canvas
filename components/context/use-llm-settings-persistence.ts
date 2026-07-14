"use client";
import React from "react";
import { useSession } from "next-auth/react";
import { fetchLlmSettings, persistLlmSettings } from "@/lib/client/llm-settings-client";
import { cloneDefaultLlmSettingsState, normalizeLlmSettingsState, type LlmSettingsState } from "@/lib/llm/user-settings";
const LEGACY_STORAGE_KEY_PREFIX = "nodes.llm-settings.v1:";
const SAVE_DEBOUNCE_MS = 450;
const readLegacySettings = (storageKey: string) => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw)
            return null;
        return normalizeLlmSettingsState(JSON.parse(raw) as Partial<LlmSettingsState>);
    }
    catch {
        return null;
    }
};
const clearLegacySettings = (storageKey: string) => {
    try {
        localStorage.removeItem(storageKey);
    }
    catch {
        // ignore storage errors
    }
};
export function useLlmSettingsPersistence() {
    const { data: session, status } = useSession();
    const userId = session?.user?.id ?? null;
    const legacyStorageKey = React.useMemo(() => `${LEGACY_STORAGE_KEY_PREFIX}${userId ?? "guest"}`, [userId]);
    const [settings, setSettings] = React.useState<LlmSettingsState>(cloneDefaultLlmSettingsState);
    const [policy, setPolicy] = React.useState({
        openrouter: {
            hasDeploymentKey: false,
            requireUserKey: false,
        },
    });
    const [isReady, setIsReady] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [lastSaveError, setLastSaveError] = React.useState<string | null>(null);
    const persistedSignatureRef = React.useRef<string | null>(null);
    const latestSettingsRef = React.useRef<LlmSettingsState>(settings);
    const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        latestSettingsRef.current = settings;
    }, [settings]);
    const persistSettingsNow = React.useCallback(async (next: LlmSettingsState) => {
        setLastSaveError(null);
        setIsSaving(true);
        try {
            const saved = await persistLlmSettings(next);
            const savedSignature = JSON.stringify(saved.settings);
            persistedSignatureRef.current = savedSignature;
            setPolicy(saved.policy);
            if (JSON.stringify(latestSettingsRef.current) === JSON.stringify(next)) {
                setSettings(saved.settings);
            }
            clearLegacySettings(legacyStorageKey);
            return true;
        }
        catch (error) {
            console.error("Failed to persist LLM settings", error);
            setLastSaveError(error instanceof Error ? error.message : "Failed to save settings.");
            return false;
        }
        finally {
            setIsSaving(false);
        }
    }, [legacyStorageKey]);
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
                }
                else {
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
                        }
                        else {
                            next = legacy;
                            legacyPayload = legacy;
                        }
                        migrateLegacy = true;
                    }
                }
            }
            catch (error) {
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
                    }
                    else {
                        next = legacy;
                        legacyPayload = legacy;
                    }
                    migrateLegacy = true;
                }
            }
            if (cancelled)
                return;
            const signature = JSON.stringify(next);
            setSettings(next);
            persistedSignatureRef.current = signature;
            setIsReady(true);
            if (migrateLegacy) {
                void persistLlmSettings(legacyPayload ?? next)
                    .then((saved) => {
                    if (cancelled)
                        return;
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
        if (!isReady || !userId)
            return;
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
            void persistSettingsNow(settings);
        }, SAVE_DEBOUNCE_MS);
        saveTimeoutRef.current = timeoutId;
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [isReady, persistSettingsNow, settings, userId]);
    const persistSettingsImmediately = React.useCallback((next: LlmSettingsState) => {
        if (!isReady || !userId)
            return;
        void persistSettingsNow(next);
    }, [isReady, persistSettingsNow, userId]);
    const saveSettingsNow = React.useCallback(async () => {
        if (!isReady)
            return false;
        if (!userId) {
            setLastSaveError("Authentication required. Sign in again.");
            return false;
        }
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        return persistSettingsNow(latestSettingsRef.current);
    }, [isReady, persistSettingsNow, userId]);
    const hasUnsavedChanges = React.useMemo(() => JSON.stringify(settings) !== persistedSignatureRef.current, [settings]);
    return {
        settings,
        setSettings,
        policy,
        isReady,
        isSaving,
        lastSaveError,
        persistSettingsImmediately,
        saveSettingsNow,
        hasUnsavedChanges,
    };
}
