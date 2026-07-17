"use client";

import React from "react";
import { LLM_PROVIDER_IDS, type LlmProviderId } from "@/lib/llm/provider-catalog";
import { getSupportedModelConfig } from "@/lib/model-options";
import { hasPostAuthChatHandoff } from "@/lib/client/post-auth-handoff";

export type HistoryMode = "last" | "full";
export type ModelProvider = LlmProviderId;
export type SessionViewMode = "chat" | "split" | "canvas";
export type StandaloneSessionViewMode = Exclude<SessionViewMode, "split">;
export type SplitWorkspacePane = "chat" | "canvas";

export const SPLIT_WORKSPACE_PANES: SplitWorkspacePane[] = [
  "chat",
  "canvas",
];

export type SplitPaneVisibility = Record<SplitWorkspacePane, boolean>;

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
  focusedMessageId: string | null;
  setFocusedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  canvasSelectionId: string | null;
  setCanvasSelectionId: React.Dispatch<React.SetStateAction<string | null>>;
  llmEnabled: boolean;
  setLlmEnabled: (value: boolean) => void;
  modelConfig: ModelConfig;
  setModelConfig: (value: ModelConfig) => void;
  viewMode: SessionViewMode;
  setViewMode: (value: SessionViewMode) => void;
  toggleSplitView: () => void;
  splitPaneVisibility: SplitPaneVisibility;
  setSplitPaneOpen: (pane: SplitWorkspacePane, open: boolean) => void;
  toggleSplitPane: (pane: SplitWorkspacePane) => void;
  splitRatio: number;
  setSplitRatio: (value: number | ((prev: number) => number)) => void;
  secondarySplitRatio: number;
  setSecondarySplitRatio: (value: number | ((prev: number) => number)) => void;
  linkOverrides: Map<string, LinkOverrideEntry>;
  setLinkOverrides: React.Dispatch<React.SetStateAction<Map<string, LinkOverrideEntry>>>;
  sessionId: string;
};

type SessionUiActionsContextValue = Pick<
  SessionUiStateContextValue,
  "setCanvasSelectionId" | "setFocusedMessageId"
>;

const LEGACY_HISTORY_MODE_KEY = "historyMode";
const LEGACY_LLM_ENABLED_KEY = "llmEnabled";
const LEGACY_MODEL_CONFIG_KEY = "modelConfig";
const LEGACY_VIEW_MODE_KEY = "workspaceViewMode";
const LEGACY_LINK_OVERRIDES_KEY = "threadGraph.linkOverrides.v1";
const OLD_DEFAULT_SPLIT_RATIO = 1 / 3;
const OLD_DEFAULT_SECONDARY_SPLIT_RATIO = 0.5;
const DEFAULT_SPLIT_RATIO = 0.28;
const DEFAULT_SECONDARY_SPLIT_RATIO = 0.58;
const DEFAULT_VIEW_MODE: SessionViewMode = "split";
const DEFAULT_STANDALONE_VIEW_MODE: StandaloneSessionViewMode = "canvas";
const DEFAULT_SPLIT_PANE_VISIBILITY: SplitPaneVisibility = {
  chat: true,
  canvas: true,
};

const DEFAULT_MODEL_CONFIG: ModelConfig = getSupportedModelConfig({
  modelId: process.env.NEXT_PUBLIC_DEFAULT_MODEL,
  provider: (process.env.NEXT_PUBLIC_DEFAULT_PROVIDER as ModelProvider | undefined) ?? "openrouter",
});

const SessionUiStateContext = React.createContext<SessionUiStateContextValue | null>(null);
const SessionUiActionsContext = React.createContext<SessionUiActionsContextValue | null>(null);

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

const readNumericStorageValue = (sessionKey: string, fallbackSessionKey?: string) => {
  const raw = readStorageValue(sessionKey, fallbackSessionKey);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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
      typeof parsed.provider === "string" &&
      (LLM_PROVIDER_IDS as readonly string[]).includes(parsed.provider)
    ) {
      return {
        modelId: parsed.modelId,
        provider: parsed.provider as ModelProvider,
      };
    }
  } catch {
    // ignore malformed persisted state
  }
  return DEFAULT_MODEL_CONFIG;
};

const readSplitRatio = (sessionId: string) => {
  const parsed = readNumericStorageValue(
    getScopedStorageKey(sessionId, "splitRatio.v3"),
    getScopedStorageKey(sessionId, "splitRatio.v2"),
  );
  if (parsed === null) return DEFAULT_SPLIT_RATIO;
  if (Math.abs(parsed - OLD_DEFAULT_SPLIT_RATIO) < 0.001) {
    return DEFAULT_SPLIT_RATIO;
  }
  return parsed;
};

const readSecondarySplitRatio = (sessionId: string) => {
  const parsed = readNumericStorageValue(
    getScopedStorageKey(sessionId, "secondarySplitRatio.v3"),
    getScopedStorageKey(sessionId, "secondarySplitRatio.v2"),
  );
  if (parsed === null) return DEFAULT_SECONDARY_SPLIT_RATIO;
  if (Math.abs(parsed - OLD_DEFAULT_SECONDARY_SPLIT_RATIO) < 0.001) {
    return DEFAULT_SECONDARY_SPLIT_RATIO;
  }
  return parsed;
};

const ensureAtLeastOneSplitPane = (value: SplitPaneVisibility): SplitPaneVisibility => {
  if (SPLIT_WORKSPACE_PANES.some((pane) => value[pane])) {
    return value;
  }
  return {
    ...value,
    canvas: true,
  };
};

const readSplitPaneVisibility = (sessionId: string): SplitPaneVisibility => {
  const raw = readStorageValue(getScopedStorageKey(sessionId, "splitPaneVisibility"));
  if (!raw) {
    return DEFAULT_SPLIT_PANE_VISIBILITY;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<SplitWorkspacePane, boolean>>;
    return ensureAtLeastOneSplitPane({
      chat: parsed.chat ?? DEFAULT_SPLIT_PANE_VISIBILITY.chat,
      canvas: parsed.canvas ?? DEFAULT_SPLIT_PANE_VISIBILITY.canvas,
    });
  } catch {
    return DEFAULT_SPLIT_PANE_VISIBILITY;
  }
};

const readViewMode = (sessionId: string): SessionViewMode => {
  const value = readStorageValue(
    getScopedStorageKey(sessionId, "viewMode"),
    LEGACY_VIEW_MODE_KEY,
  );
  if (
    value === "chat" ||
    value === "canvas" ||
    value === "split"
  ) {
    return value;
  }
  if (hasPostAuthChatHandoff()) {
    return "chat";
  }
  return DEFAULT_VIEW_MODE;
};

const isStandaloneViewMode = (value: string | null): value is StandaloneSessionViewMode =>
  value === "chat" || value === "canvas";

const readLastStandaloneViewMode = (
  sessionId: string,
  viewMode: SessionViewMode,
): StandaloneSessionViewMode => {
  if (viewMode !== "split") {
    return viewMode;
  }
  const value = readStorageValue(getScopedStorageKey(sessionId, "lastStandaloneViewMode"));
  if (isStandaloneViewMode(value)) {
    return value;
  }
  return DEFAULT_STANDALONE_VIEW_MODE;
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
  const [focusedMessageId, setFocusedMessageId] = React.useState<string | null>(null);
  const [canvasSelectionId, setCanvasSelectionId] = React.useState<string | null>(null);
  const [llmEnabled, setLlmEnabled] = React.useState<boolean>(() => readLlmEnabled(sessionId));
  const [modelConfig, setModelConfig] = React.useState<ModelConfig>(() => readModelConfig(sessionId));
  const [viewMode, setViewModeState] = React.useState<SessionViewMode>(() => readViewMode(sessionId));
  const [lastStandaloneViewMode, setLastStandaloneViewMode] =
    React.useState<StandaloneSessionViewMode>(() =>
      readLastStandaloneViewMode(sessionId, readViewMode(sessionId)),
    );
  const [splitPaneVisibility, setSplitPaneVisibility] = React.useState<SplitPaneVisibility>(() =>
    readSplitPaneVisibility(sessionId),
  );
  const [splitRatio, setSplitRatio] = React.useState<number>(() => readSplitRatio(sessionId));
  const [secondarySplitRatio, setSecondarySplitRatio] = React.useState<number>(() =>
    readSecondarySplitRatio(sessionId),
  );
  const [linkOverrides, setLinkOverrides] = React.useState<Map<string, LinkOverrideEntry>>(
    () => readLinkOverrides(sessionId),
  );
  const viewModeRef = React.useRef(viewMode);
  const lastStandaloneViewModeRef = React.useRef(lastStandaloneViewMode);

  React.useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  React.useEffect(() => {
    lastStandaloneViewModeRef.current = lastStandaloneViewMode;
  }, [lastStandaloneViewMode]);

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
      localStorage.setItem(
        getScopedStorageKey(sessionId, "lastStandaloneViewMode"),
        lastStandaloneViewMode,
      );
    } catch {
      // ignore storage errors
    }
  }, [lastStandaloneViewMode, sessionId]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        getScopedStorageKey(sessionId, "splitPaneVisibility"),
        JSON.stringify(splitPaneVisibility),
      );
    } catch {
      // ignore storage errors
    }
  }, [sessionId, splitPaneVisibility]);

  React.useEffect(() => {
    try {
      localStorage.setItem(getScopedStorageKey(sessionId, "splitRatio.v3"), String(splitRatio));
    } catch {
      // ignore storage errors
    }
  }, [sessionId, splitRatio]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        getScopedStorageKey(sessionId, "secondarySplitRatio.v3"),
        String(secondarySplitRatio),
      );
    } catch {
      // ignore storage errors
    }
  }, [secondarySplitRatio, sessionId]);

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

  const setSplitPaneOpen = React.useCallback((pane: SplitWorkspacePane, open: boolean) => {
    setSplitPaneVisibility((prev) => {
      const next = ensureAtLeastOneSplitPane({
        ...prev,
        [pane]: open,
      });
      if (SPLIT_WORKSPACE_PANES.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
  }, []);

  const toggleSplitPane = React.useCallback((pane: SplitWorkspacePane) => {
    setSplitPaneVisibility((prev) => {
      const next = ensureAtLeastOneSplitPane({
        ...prev,
        [pane]: !prev[pane],
      });
      if (SPLIT_WORKSPACE_PANES.every((key) => prev[key] === next[key])) {
        return prev;
      }
      return next;
    });
  }, []);

  const setViewMode = React.useCallback((value: SessionViewMode) => {
    const currentViewMode = viewModeRef.current;
    if (value === "split") {
      if (currentViewMode !== "split") {
        setLastStandaloneViewMode(currentViewMode);
      }
    } else {
      setLastStandaloneViewMode(value);
    }
    setViewModeState((prev) => (prev === value ? prev : value));
  }, []);

  const toggleSplitView = React.useCallback(() => {
    if (viewModeRef.current === "split") {
      const nextViewMode = lastStandaloneViewModeRef.current;
      setViewModeState((prev) => (prev === nextViewMode ? prev : nextViewMode));
      return;
    }
    const currentViewMode = viewModeRef.current;
    setLastStandaloneViewMode(currentViewMode);
    setViewModeState("split");
  }, []);

  const value = React.useMemo<SessionUiStateContextValue>(
    () => ({
      historyMode,
      setHistoryMode,
      focusedMessageId,
      setFocusedMessageId,
      canvasSelectionId,
      setCanvasSelectionId,
      llmEnabled,
      setLlmEnabled,
      modelConfig,
      setModelConfig,
      viewMode,
      setViewMode,
      toggleSplitView,
      splitPaneVisibility,
      setSplitPaneOpen,
      toggleSplitPane,
      splitRatio,
      setSplitRatio,
      secondarySplitRatio,
      setSecondarySplitRatio,
      linkOverrides,
      setLinkOverrides,
      sessionId,
    }),
    [
      historyMode,
      focusedMessageId,
      canvasSelectionId,
      llmEnabled,
      modelConfig,
      viewMode,
      setViewMode,
      splitPaneVisibility,
      toggleSplitView,
      setSplitPaneOpen,
      toggleSplitPane,
      splitRatio,
      secondarySplitRatio,
      linkOverrides,
      sessionId,
    ],
  );

  const actions = React.useMemo<SessionUiActionsContextValue>(
    () => ({ setCanvasSelectionId, setFocusedMessageId }),
    [setCanvasSelectionId, setFocusedMessageId],
  );

  return (
    <SessionUiActionsContext.Provider value={actions}>
      <SessionUiStateContext.Provider value={value}>
        {children}
      </SessionUiStateContext.Provider>
    </SessionUiActionsContext.Provider>
  );
}

export function useSessionUiState() {
  const context = React.useContext(SessionUiStateContext);
  if (!context) {
    throw new Error("useSessionUiState must be used within SessionUiStateProvider");
  }
  return context;
}

export function useSessionUiActions() {
  const context = React.useContext(SessionUiActionsContext);
  if (!context) {
    throw new Error("useSessionUiActions must be used within SessionUiStateProvider");
  }
  return context;
}

export function useWorkspaceSplitState() {
  const {
    splitRatio,
    setSplitRatio,
    secondarySplitRatio,
    setSecondarySplitRatio,
    viewMode,
    setViewMode,
    toggleSplitView,
    splitPaneVisibility,
    setSplitPaneOpen,
    toggleSplitPane,
  } = useSessionUiState();
  return {
    splitRatio,
    setSplitRatio,
    secondarySplitRatio,
    setSecondarySplitRatio,
    viewMode,
    setViewMode,
    toggleSplitView,
    splitPaneVisibility,
    setSplitPaneOpen,
    toggleSplitPane,
  };
}
