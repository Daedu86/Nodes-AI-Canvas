"use client";

import {
  ArrowRightLeft,
  BookCopy,
  Bot,
  Compass,
  MessageSquareText,
  Network,
  Sparkles,
  Telescope,
  Waypoints,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useNodyPanel } from "@/components/context/nody-panel";
import { useSessionUiState } from "@/components/context/session-ui-state";
import {
  getCanvasGuideActionLabel,
  type CanvasGuideAction,
} from "@/lib/canvas-agent/canvas-agent-context";

const phaseLabel = {
  idle: "Idle",
  observing: "Observing",
  thinking: "Thinking",
  speaking: "Speaking",
} as const;

const quickActions: Array<{
  action: CanvasGuideAction;
  icon: typeof Sparkles;
}> = [
  { action: "explain-focus", icon: Sparkles },
  { action: "summarize-branch", icon: Waypoints },
  { action: "survey-tree", icon: Telescope },
];

type InsightSections = {
  interpretation: string;
  nextMove: string;
  observation: string;
};

const fallbackInsightSections = (insight: string): InsightSections => ({
  interpretation: insight.trim(),
  nextMove: "Use the workspace actions below to keep the reasoning moving.",
  observation: "Nody produced an unstructured response, so it is shown here as the main interpretation.",
});

const extractSection = (text: string, label: string, fallback: string) => {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:Observation|Interpretation|Next move):|$)`, "i");
  const match = text.match(pattern);
  return match?.[1]?.trim() || fallback;
};

const parseInsight = (insight: string | null): InsightSections | null => {
  if (!insight || insight.trim().length === 0) return null;
  if (!/(Observation|Interpretation|Next move):/i.test(insight)) {
    return fallbackInsightSections(insight);
  }
  return {
    observation: extractSection(insight, "Observation", "No direct observation provided."),
    interpretation: extractSection(insight, "Interpretation", "No interpretation provided."),
    nextMove: extractSection(insight, "Next move", "No next move provided."),
  };
};

const scrollMessageIntoView = (messageId: string) => {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

export function NodyPanel() {
  const {
    busy,
    error,
    focusLabel,
    insight,
    lastAction,
    llmEnabled,
    phase,
    question,
    recentInsights,
    runAction,
    selectedWikiPageId,
    setQuestion,
    snapshot,
    wiki,
  } = useNodyPanel();
  const { setFocusedMessageId, setViewMode } = useSessionUiState();

  const statusLabel = busy ? "Synthesizing" : llmEnabled ? "Ready" : "Offline";
  const statusDotClass = busy ? "bg-amber-500" : llmEnabled ? "bg-emerald-500" : "bg-rose-500";
  const compactFocusLabel = focusLabel.trim().length > 0 ? focusLabel : "Session tree";
  const insightSections = React.useMemo(() => parseInsight(insight), [insight]);
  const selectedNode = React.useMemo(
    () => snapshot?.nodes.find((node) => node.id === snapshot.selectedNodeId) ?? null,
    [snapshot],
  );
  const selectedArtifact = React.useMemo(
    () => snapshot?.artifacts.find((artifact) => artifact.id === snapshot.selectedNodeId) ?? null,
    [snapshot],
  );
  const canOpenSelectedMessageInChat = Boolean(
    selectedNode && selectedNode.id !== "__ROOT__" && !selectedArtifact,
  );

  const handleOpenSelectedInChat = React.useCallback(() => {
    if (!selectedNode || selectedNode.id === "__ROOT__") return;
    setFocusedMessageId(selectedNode.id);
    setViewMode("split");
    scrollMessageIntoView(selectedNode.id);
  }, [selectedNode, setFocusedMessageId, setViewMode]);

  const workspaceStats = React.useMemo(() => {
    if (!snapshot) {
      return {
        artifactCount: 0,
        nodeCount: 0,
        rootBranchCount: 0,
      };
    }
    return {
      artifactCount: snapshot.artifacts.length,
      nodeCount: snapshot.nodes.filter((node) => node.id !== "__ROOT__").length,
      rootBranchCount: snapshot.nodes.filter((node) => node.parentId === "__ROOT__").length,
    };
  }, [snapshot]);
  const activeWikiPage = React.useMemo(
    () => wiki?.pages.find((page) => page.id === selectedWikiPageId) ?? wiki?.pages[0] ?? null,
    [selectedWikiPageId, wiki],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="border-b border-border/60 bg-[linear-gradient(90deg,rgba(14,165,233,0.08),rgba(56,189,248,0.02),rgba(124,58,237,0.04))] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/8 text-sky-700">
            <Bot className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Nody</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                {phaseLabel[phase]}
              </span>
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Watches the canvas, interprets the active graph focus, and recommends the next move.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Focus
            </span>
            {lastAction ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {getCanvasGuideActionLabel(lastAction)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{compactFocusLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.nodeCount} nodes
            </span>
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.rootBranchCount} root branches
            </span>
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.artifactCount} artifacts
            </span>
          </div>
          {selectedNode ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Selected message: <span className="font-medium text-foreground/85">{selectedNode.role}</span> ·{" "}
              {selectedNode.text.replace(/\s+/g, " ").trim().slice(0, 140) || "No preview"}
            </p>
          ) : selectedArtifact ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Selected artifact: <span className="font-medium text-foreground/85">{selectedArtifact.title}</span>
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Nody reasons from the currently selected node or the latest visible canvas context.
            </p>
          )}
          {activeWikiPage ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Active wiki page: <span className="font-medium text-foreground/85">{activeWikiPage.title}</span> ·{" "}
              {activeWikiPage.summary}
            </p>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-sky-700" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Workspace Actions
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setViewMode("canvas")}>
              <Network className="mr-1.5 h-3.5 w-3.5" />
              Open canvas
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setViewMode("wiki")}>
              <BookCopy className="mr-1.5 h-3.5 w-3.5" />
              Open wiki
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-full" onClick={() => setViewMode("split")}>
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              Split workspace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canOpenSelectedMessageInChat}
              className="h-9 rounded-full"
              onClick={handleOpenSelectedInChat}
            >
              <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
              Open in chat
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Structured Insight
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Output
            </span>
          </div>

          {insightSections ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Observation</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{insightSections.observation}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">Interpretation</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{insightSections.interpretation}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Next move</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{insightSections.nextMove}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-foreground/90">
              {llmEnabled
                ? "I am ready. Ask me to explain the focus, summarize the active branch, or survey the whole tree."
                : "Enable AI to let Nody reason over the canvas."}
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-700" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Quick Actions
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ action, icon: Icon }) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !llmEnabled}
                className="h-9 rounded-full border-border/60 px-3 text-xs font-medium"
                onClick={() => {
                  void runAction(action);
                }}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5 text-sky-700" />
                {getCanvasGuideActionLabel(action)}
              </Button>
            ))}
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700"
            >
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-sky-700" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Ask Nody
            </p>
          </div>
          <textarea
            aria-label="Ask Nody"
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask what this branch means, what evidence is missing, or what should be promoted next..."
            className="mt-3 min-h-[120px] w-full resize-y rounded-[16px] border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500/35"
          />
          <Button
            type="button"
            disabled={busy || !llmEnabled || question.trim().length === 0}
            className="mt-3 rounded-full"
            onClick={() => {
              void runAction("ask-guide", question.trim());
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Ask Nody
          </Button>
        </section>

        {recentInsights.length > 0 ? (
          <section className="space-y-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-sky-700" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recent Passes
              </p>
            </div>
            <div className="space-y-2">
              {recentInsights.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {getCanvasGuideActionLabel(entry.action)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{entry.focusLabel}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground/85">{entry.text}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
