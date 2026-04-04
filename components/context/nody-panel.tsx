"use client";

import React from "react";
import type { HistoryMode } from "@/components/context/session-ui-state";
import {
  buildCanvasGuidePayload,
  type CanvasGuideAction,
  type CanvasGuideGraphEdge,
  type CanvasGuideGraphNode,
} from "@/lib/canvas-agent/canvas-agent-context";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import {
  buildSessionWiki,
  type SessionWiki,
  type SessionWikiPageId,
} from "@/lib/session-wiki";

type NodyPhase = "idle" | "observing" | "thinking" | "speaking";

type NodySnapshot = {
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  edges: CanvasGuideGraphEdge[];
  historyMode: HistoryMode;
  llmEnabled: boolean;
  modelId: string;
  nodes: CanvasGuideGraphNode[];
  provider: string;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
};

type NodyInsightEntry = {
  action: CanvasGuideAction;
  focusLabel: string;
  id: string;
  text: string;
};

type NodyPanelContextValue = {
  busy: boolean;
  error: string | null;
  focusLabel: string;
  insight: string | null;
  lastAction: CanvasGuideAction | null;
  llmEnabled: boolean;
  phase: NodyPhase;
  publishSnapshot: (snapshot: NodySnapshot | null) => void;
  question: string;
  recentInsights: NodyInsightEntry[];
  runAction: (action: CanvasGuideAction, ask?: string | null) => Promise<void>;
  setQuestion: (value: string) => void;
  selectedWikiPageId: SessionWikiPageId;
  setSelectedWikiPageId: (value: SessionWikiPageId) => void;
  snapshot: NodySnapshot | null;
  wiki: SessionWiki | null;
};

const NodyPanelContext = React.createContext<NodyPanelContextValue | null>(null);

const defaultFocusLabel = "Session tree";

export function NodyPanelProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<NodySnapshot | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState<NodyPhase>("idle");
  const [insight, setInsight] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastAction, setLastAction] = React.useState<CanvasGuideAction | null>(null);
  const [question, setQuestion] = React.useState("");
  const [recentInsights, setRecentInsights] = React.useState<NodyInsightEntry[]>([]);
  const [selectedWikiPageId, setSelectedWikiPageId] = React.useState<SessionWikiPageId>("overview");

  const wiki = React.useMemo(
    () =>
      snapshot
        ? buildSessionWiki({
            artifacts: snapshot.artifacts,
            contextLinks: snapshot.contextLinks,
            nodes: snapshot.nodes,
            selectedNodeId: snapshot.selectedNodeId,
            sessionTitle: snapshot.sessionTitle,
          })
        : null,
    [snapshot],
  );

  const focusLabel = React.useMemo(() => {
    if (!snapshot) return defaultFocusLabel;
    return buildCanvasGuidePayload({
      action: "survey-tree",
      artifacts: snapshot.artifacts,
      contextLinks: snapshot.contextLinks,
      edges: snapshot.edges,
      historyMode: snapshot.historyMode,
      modelId: snapshot.modelId,
      nodes: snapshot.nodes,
      provider: snapshot.provider,
      selectedEdgeId: snapshot.selectedEdgeId,
      selectedNodeId: snapshot.selectedNodeId,
      sessionId: snapshot.sessionId,
      sessionTitle: snapshot.sessionTitle,
    }).focus.label;
  }, [snapshot]);

  const runAction = React.useCallback(
    async (action: CanvasGuideAction, ask?: string | null) => {
      if (!snapshot) {
        setError("Open the canvas once so Nody can read the current workspace.");
        setPhase("idle");
        return;
      }

      if (!snapshot.llmEnabled) {
        setError("Enable AI before asking Nody to reason over the workspace.");
        setPhase("idle");
        return;
      }

      const payload = buildCanvasGuidePayload({
        action,
        ask,
        artifacts: snapshot.artifacts,
        contextLinks: snapshot.contextLinks,
        edges: snapshot.edges,
        historyMode: snapshot.historyMode,
        modelId: snapshot.modelId,
        nodes: snapshot.nodes,
        provider: snapshot.provider,
        selectedEdgeId: snapshot.selectedEdgeId,
        selectedNodeId: snapshot.selectedNodeId,
        sessionId: snapshot.sessionId,
        sessionTitle: snapshot.sessionTitle,
      });
      const payloadWithWiki = wiki
        ? {
            ...payload,
            knowledgeBase: {
              activePageTitle:
                wiki.pages.find((page) => page.id === selectedWikiPageId)?.title ?? wiki.pages[0]?.title ?? "Overview",
              digest: wiki.digest,
              pageCount: wiki.pages.length,
              pages: wiki.pages.map((page) => ({
                id: page.id,
                summary: page.summary,
                title: page.title,
              })),
            },
          }
        : payload;

      setBusy(true);
      setError(null);
      setLastAction(action);
      setPhase("thinking");

      try {
        const response = await fetch("/api/canvas-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            model: snapshot.modelId,
            payload: payloadWithWiki,
            provider: snapshot.provider,
          }),
        });

        const data = (await response.json()) as { error?: string; text?: string };
        if (!response.ok || !data.text) {
          throw new Error(data.error ?? `Nody failed: ${response.status}`);
        }
        const responseText = data.text;

        setInsight(responseText);
        setRecentInsights((current) => [
          {
            action,
            focusLabel: payload.focus.label,
            id: `${Date.now()}:${action}`,
            text: responseText,
          },
          ...current,
        ].slice(0, 4));
        setQuestion("");
        setPhase("speaking");
      } catch (requestError) {
        console.error("Nody request failed", requestError);
        setError("Nody could not read this workspace right now. Try again in a moment.");
        setPhase(snapshot.selectedNodeId || snapshot.selectedEdgeId ? "observing" : "idle");
      } finally {
        setBusy(false);
      }
    },
    [selectedWikiPageId, snapshot, wiki],
  );

  React.useEffect(() => {
    if (!snapshot) {
      setPhase("idle");
      return;
    }
    if (busy) return;
    setPhase(snapshot.selectedNodeId || snapshot.selectedEdgeId ? "observing" : "idle");
  }, [busy, snapshot]);

  const value = React.useMemo<NodyPanelContextValue>(
    () => ({
      busy,
      error,
      focusLabel,
      insight,
      lastAction,
      llmEnabled: snapshot?.llmEnabled ?? true,
      phase,
      publishSnapshot: setSnapshot,
      question,
      recentInsights,
      runAction,
      setQuestion,
      selectedWikiPageId,
      setSelectedWikiPageId,
      snapshot,
      wiki,
    }),
    [
      busy,
      error,
      focusLabel,
      insight,
      lastAction,
      phase,
      question,
      recentInsights,
      runAction,
      selectedWikiPageId,
      snapshot,
      wiki,
    ],
  );

  return <NodyPanelContext.Provider value={value}>{children}</NodyPanelContext.Provider>;
}

export function useNodyPanel() {
  const context = React.useContext(NodyPanelContext);
  if (!context) {
    throw new Error("useNodyPanel must be used within NodyPanelProvider");
  }
  return context;
}

export type { NodyInsightEntry, NodyPhase, NodySnapshot };
