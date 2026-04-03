"use client";

import React from "react";
import { getSupportedModelConfig } from "@/lib/model-options";

export type HistoryMode = "last" | "full";
export type ModelProvider = "ollama" | "openrouter";
export type SessionViewMode = "chat" | "split" | "canvas";

export type ModelConfig = {
  modelId: string;
  provider: ModelProvider;
};

export type LinkOverrideEntry = {
  parentId: string | null;
  originalParentId: string | null;
};

type SessionUiStateContextValue = {
  historyMode: HistoryMode;
  setHistoryMode: (value: HistoryMode) => void;
  llmEnabled: boolean;
  setLlmEnabled: (value: boolean) => void;
  modelConfig: ModelConfig;
  setModelConfig: (value: ModelConfig) => void;
  viewMode: SessionViewMode;
  setViewMode: (value: SessionViewMode) => void;
  splitRatio: number;
  setSplitRatio: (value: number | ((prev: number) => number)) => void;
  linkOverrides: Map<string, LinkOverrideEntry>;
  setLinkOverrides: React.Dispatch<React.SetStateAction<Map<string, LinkOverrideEntry>>>;
  sessionId: string;
};

const LEGACY_HISTORY_MODE_KEY = "historyMode";
const LEGACY_LLM_ENABLED_KEY = "llmEnabled";
const LEGACY_MODEL_CONFIG_KEY = "modelConfig";
const LEGACY_VIEW_MODE_KEY = "workspaceViewMode";
const LEGACY_SPLIT_RATIO_KEY = "workspaceSplitRatio";
const LEGACY_LINK_OVERRIDES_KEY = "threadGraph.linkOverrides.v1";
const DEFAULT_SPLIT_RATIO = 0.6;
const DEFAULT_VIEW_MODE: SessionViewMode = "split";

const DEFAULT_MODEL_CONFIG: ModelConfig = getSupportedModelConfig({
  modelId: process.env.NEXT_PUBLIC_DEFAULT_MODEL,
  provider:
    process.env.NEXT_PUBLIC_DEFAULT_PROVIDER === "ollama"
      ? "ollama"
      : "openrouter",
});

const SessionUiStateContext = React.createContext<SessionUiStateContextValue | null>(null);

const getScopedStorageKey = (sessionId: string, suffix: string) =>
  `session-ui.${suffix}.v1:${sessionId}`;

const readStorageValue = (sessionKey: string, legacyKey?: string) => {
  try {
    const sessionValue = localStorage.getItem(sessionKey);
    if (sessionValue !== null) return sessionValue;
    if (!legacyKey) return null;
    return localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
};

const readHistoryMode = (sessionId: string): HistoryMode => {
  const value = readStorageValue(
    getScopedStorageKey(sessionId, "historyMode"),
    LEGACY_HISTORY_MODE_KEY,
  );
  return value === "full" ? "full" : "last";
};

const readLlmEnabled = (sessionId: string): boolean => {
  const value = readStorageValue(
    getScopedStorageKey(sessionId, "llmEnabled"),
    LEGACY_LLM_ENABLED_KEY,
  );
  if (value === "false") return false;
  return true;
};

const readModelConfig = (sessionId: string): ModelConfig => {
  const raw = readStorageValue(
    getScopedStorageKey(sessionId, "modelConfig"),
    LEGACY_MODEL_CONFIG_KEY,
  );
  if (!raw) return DEFAULT_MODEL_CONFIG;

  try {
    const parsed = JSON.parse(raw) as Partial<ModelConfig>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.modelId === "string" &&
      (parsed.provider === "ollama" || parsed.provider === "openrouter")
    ) {
      return getSupportedModelConfig({
        modelId: parsed.modelId,
        provider: parsed.provider,
      });
    }
  } catch {
    // ignore malformed persisted state
  }
  return DEFAULT_MODEL_CONFIG;
};

const readSplitRatio = (sessionId: string) => {
  const raw = readStorageValue(
    getScopedStorageKey(sessionId, "splitRatio"),
    LEGACY_SPLIT_RATIO_KEY,
  );
  if (!raw) return DEFAULT_SPLIT_RATIO;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SPLIT_RATIO;
};

const readViewMode = (sessionId: string): SessionViewMode => {
  const value = readStorageValue(
    getScopedStorageKey(sessionId, "viewMode"),
    LEGACY_VIEW_MODE_KEY,
  );
  if (value === "chat" || value === "canvas" || value === "split") {
    return value;
  }
  return DEFAULT_VIEW_MODE;
};

const readLinkOverrides = (sessionId: string) => {
  const raw = readStorageValue(
    getScopedStorageKey(sessionId, "linkOverrides"),
    LEGACY_LINK_OVERRIDES_KEY,
  );
  if (!raw) return new Map<string, LinkOverrideEntry>();

  try {
    const parsed = JSON.parse(raw) as Record<string, LinkOverrideEntry>;
    const map = new Map<string, LinkOverrideEntry>();
    Object.entries(parsed).forEach(([childId, entry]) => {
      if (!entry || typeof entry !== "object") return;
      map.set(childId, {
        parentId: entry.parentId ?? null,
        originalParentId: entry.originalParentId ?? null,
      });
    });
    return map;
  } catch {
    return new Map<string, LinkOverrideEntry>();
  }
};

export function SessionUiStateProvider({
  children,
  sessionId,
}: {
  children: React.ReactNode;
  sessionId: string;
}) {
  const [historyMode, setHistoryMode] = React.useState<HistoryMode>(() => readHistoryMode(sessionId));
  const [llmEnabled, setLlmEnabled] = React.useState<boolean>(() => readLlmEnabled(sessionId));
  const [modelConfig, setModelConfig] = React.useState<ModelConfig>(() => readModelConfig(sessionId));
  const [viewMode, setViewMode] = React.useState<SessionViewMode>(() => readViewMode(sessionId));
  const [splitRatio, setSplitRatio] = React.useState<number>(() => readSplitRatio(sessionId));
  const [linkOverrides, setLinkOverrides] = React.useState<Map<string, LinkOverrideEntry>>(
    () => readLinkOverrides(sessionId),
  );

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedStorageKey(sessionId, "historyMode"), historyMode);
    } catch {
      // ignore storage errors
    }
  }, [historyMode, sessionId]);

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedStorageKey(sessionId, "llmEnabled"), String(llmEnabled));
    } catch {
      // ignore storage errors
    }
  }, [llmEnabled, sessionId]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        getScopedStorageKey(sessionId, "modelConfig"),
        JSON.stringify(modelConfig),
      );
    } catch {
      // ignore storage errors
    }
  }, [modelConfig, sessionId]);

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedStorageKey(sessionId, "viewMode"), viewMode);
    } catch {
      // ignore storage errors
    }
  }, [sessionId, viewMode]);

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedStorageKey(sessionId, "splitRatio"), String(splitRatio));
    } catch {
      // ignore storage errors
    }
  }, [sessionId, splitRatio]);

  React.useEffect(() => {
    try {
      const storageKey = getScopedStorageKey(sessionId, "linkOverrides");
      if (linkOverrides.size === 0) {
        localStorage.removeItem(storageKey);
        return;
      }
      const output: Record<string, LinkOverrideEntry> = {};
      linkOverrides.forEach((entry, childId) => {
        output[childId] = entry;
      });
      localStorage.setItem(storageKey, JSON.stringify(output));
    } catch {
      // ignore storage errors
    }
  }, [linkOverrides, sessionId]);

  const value = React.useMemo<SessionUiStateContextValue>(
    () => ({
      historyMode,
      setHistoryMode,
      llmEnabled,
      setLlmEnabled,
      modelConfig,
      setModelConfig,
      viewMode,
      setViewMode,
      splitRatio,
      setSplitRatio,
      linkOverrides,
      setLinkOverrides,
      sessionId,
    }),
    [historyMode, llmEnabled, modelConfig, viewMode, splitRatio, linkOverrides, sessionId],
  );

  return (
    <SessionUiStateContext.Provider value={value}>
      {children}
    </SessionUiStateContext.Provider>
  );
}

export function useSessionUiState() {
  const context = React.useContext(SessionUiStateContext);
  if (!context) {
    throw new Error("useSessionUiState must be used within SessionUiStateProvider");
  }
  return context;
}

export function useWorkspaceSplitState() {
  const { splitRatio, setSplitRatio, viewMode, setViewMode } = useSessionUiState();
  return { splitRatio, setSplitRatio, viewMode, setViewMode };
}

