"use client";

import {
  Bot,
  FileText,
  MessageSquareText,
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
import type { NodySourceCatalogEntry } from "@/lib/nody-insight";
import type { SessionWikiPageId } from "@/lib/session-wiki";

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
  answer: string;
  next: string | null;
};

const scrollMessageIntoView = (messageId: string) => {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

export function NodyPanel() {
  const {
    busy,
    brief,
    error,
    focusLabel,
    lastAction,
    llmEnabled,
    phase,
    parsedInsight,
    question,
    recentInsights,
    resolvedSources,
    runAction,
    selectedWikiPageId,
    setQuestion,
    setSelectedWikiPageId,
    snapshot,
    wiki,
  } = useNodyPanel();
  const { setCanvasSelectionId, setFocusedMessageId, setViewMode } = useSessionUiState();

  const statusLabel = busy ? "Thinking" : llmEnabled ? "Ready" : "Offline";
  const statusDotClass = busy ? "bg-amber-500" : llmEnabled ? "bg-emerald-500" : "bg-rose-500";
  const compactFocusLabel = focusLabel.trim().length > 0 ? focusLabel : "Session tree";
  const insightSections = React.useMemo<InsightSections | null>(
    () =>
      parsedInsight
        ? {
            answer: parsedInsight.answer,
            next: parsedInsight.next,
          }
        : null,
    [parsedInsight],
  );
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
  const contextLabel = activeWikiPage ? `${compactFocusLabel} · ${activeWikiPage.title}` : compactFocusLabel;
  const handleOpenSource = React.useCallback(
    (source: NodySourceCatalogEntry) => {
      if (source.kind === "wiki") {
        setSelectedWikiPageId(String(source.targetId) as SessionWikiPageId);
        setViewMode("wiki");
        return;
      }
      setCanvasSelectionId(String(source.targetId));
      setViewMode("canvas");
    },
    [setCanvasSelectionId, setSelectedWikiPageId, setViewMode],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="border-b border-border/80 bg-card/72 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                <Bot className="h-4 w-4" />
              </span>
              <p className="text-base font-semibold tracking-[-0.02em] text-foreground">Nody</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ask about the canvas or the wiki.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("canvas")}>
              Canvas
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("wiki")}>
              Wiki
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("brief")}>
              Brief
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("split")}>
              Split
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canOpenSelectedMessageInChat}
              className="h-8 rounded-full px-3 text-xs"
              onClick={handleOpenSelectedInChat}
            >
              <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
              Chat
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <section className="space-y-3 rounded-[18px] border border-border/80 bg-card/88 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border/80 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Context
            </span>
            {lastAction ? (
              <span className="rounded-full border border-border/80 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {getCanvasGuideActionLabel(lastAction)}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium text-foreground">{contextLabel}</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border/80 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.nodeCount} nodes
            </span>
            <span className="rounded-full border border-border/80 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.artifactCount} artifacts
            </span>
            <span className="rounded-full border border-border/80 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              {workspaceStats.rootBranchCount} roots
            </span>
          </div>
          <textarea
            aria-label="Ask Nody"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this branch, the wiki, or what to do next..."
            className="min-h-[96px] w-full resize-y rounded-[12px] border border-border/80 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/35"
          />
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map(({ action, icon: Icon }) => (
              <Button
                key={action}
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !llmEnabled}
                className="h-8 rounded-full border-border/80 px-3 text-xs"
                onClick={() => {
                  void runAction(action);
                }}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                {getCanvasGuideActionLabel(action)}
              </Button>
            ))}
            <Button
              type="button"
              disabled={busy || !llmEnabled || question.trim().length === 0}
              className="h-8 rounded-full px-4 text-xs"
              onClick={() => {
                void runAction("ask-guide", question.trim());
              }}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Ask Nody
            </Button>
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

        <section className="space-y-3 rounded-[18px] border border-border/80 bg-card/88 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Answer
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {phaseLabel[phase]}
            </span>
          </div>

          {insightSections ? (
            <div className="space-y-3">
              <div className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{insightSections.answer}</p>
              </div>
              {insightSections.next ? (
                <div className="rounded-[12px] border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Next</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{insightSections.next}</p>
                </div>
              ) : null}
              {resolvedSources.length > 0 ? (
                <div className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Sources
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      onClick={() => setViewMode("brief")}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Open Brief
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {resolvedSources.map((source) => (
                      <button
                        key={source.ref}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded-[12px] border border-border/80 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
                        onClick={() => handleOpenSource(source)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-foreground/90">{source.label}</span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              {source.kind}
                            </span>
                          </div>
                          {source.preview ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                              {source.preview}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                          Open
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-6 text-foreground/90">
              {llmEnabled ? "Ask Nody to read the current canvas and wiki context." : "Enable AI to use Nody."}
            </p>
          )}
        </section>

        {brief ? (
          <section className="space-y-3 rounded-[18px] border border-border/80 bg-card/88 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Brief
                </p>
                <p className="mt-1 text-sm text-foreground/90">{brief.summary}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setViewMode("brief")}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Open
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {brief.signals.slice(0, 3).map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-border/80 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {signal}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {recentInsights.length > 0 ? (
          <section className="space-y-3 rounded-[18px] border border-border/80 bg-card/88 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Recent
              </p>
            </div>
            <div className="space-y-2">
              {recentInsights.map((entry) => (
                <div key={entry.id} className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/80 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {getCanvasGuideActionLabel(entry.action)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{entry.focusLabel}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground/85">{entry.text}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
