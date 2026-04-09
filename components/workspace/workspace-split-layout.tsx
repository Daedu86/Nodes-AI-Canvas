"use client";

import React from "react";
import {
  BookCopy,
  Bot,
  FileText,
  MessageSquareText,
  Plus,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type SplitWorkspacePane,
  useWorkspaceSplitState,
} from "@/components/context/session-ui-state";

type WorkspaceSplitLayoutProps = {
  chatPanel: React.ReactNode;
  canvasPanel: React.ReactNode;
  wikiPanel: React.ReactNode;
  briefPanel: React.ReactNode;
  nodyPanel: React.ReactNode;
};

type SplitPaneDefinition = {
  id: SplitWorkspacePane;
  icon: LucideIcon;
  idealWidth: number;
  label: string;
  minWidth: number;
  panel: React.ReactNode;
};

const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))] shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:ring-white/[0.03]";
const shellInnerClassName =
  "h-full min-h-0 overflow-hidden rounded-[26px] bg-background/90 dark:bg-slate-950/80";
const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.1),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.07),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.94),rgba(2,6,23,0.82))]";

const WorkspacePanelShell = ({ children }: { children: React.ReactNode }) => (
  <div className={shellClassName}>
    <div className={shellInnerClassName}>{children}</div>
  </div>
);

const SinglePanelLayer = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => (
  <div
    aria-hidden={!active}
    className={
      active
        ? "absolute inset-0 z-10"
        : "pointer-events-none absolute inset-0 opacity-0"
    }
  >
    <WorkspacePanelShell>{children}</WorkspacePanelShell>
  </div>
);

export function WorkspaceSplitLayout({
  chatPanel,
  canvasPanel,
  wikiPanel,
  briefPanel,
  nodyPanel,
}: WorkspaceSplitLayoutProps) {
  const {
    splitPaneVisibility,
    toggleSplitPane,
    viewMode,
  } = useWorkspaceSplitState();

  const splitPanes = React.useMemo<SplitPaneDefinition[]>(
    () => [
      {
        id: "chat",
        icon: MessageSquareText,
        idealWidth: 360,
        label: "Chat",
        minWidth: 280,
        panel: chatPanel,
      },
      {
        id: "canvas",
        icon: Workflow,
        idealWidth: 560,
        label: "Canvas",
        minWidth: 460,
        panel: canvasPanel,
      },
      {
        id: "wiki",
        icon: BookCopy,
        idealWidth: 400,
        label: "Wiki",
        minWidth: 320,
        panel: wikiPanel,
      },
      {
        id: "brief",
        icon: FileText,
        idealWidth: 400,
        label: "Brief",
        minWidth: 320,
        panel: briefPanel,
      },
      {
        id: "nody",
        icon: Bot,
        idealWidth: 400,
        label: "Nody",
        minWidth: 320,
        panel: nodyPanel,
      },
    ],
    [briefPanel, canvasPanel, chatPanel, nodyPanel, wikiPanel],
  );

  const openPanes = splitPanes.filter((pane) => splitPaneVisibility[pane.id]);
  const visibleSplitPanes =
    openPanes.length > 0
      ? openPanes
      : splitPanes.filter((pane) => pane.id === "canvas");
  const isSingleOpenPane = visibleSplitPanes.length === 1;

  if (viewMode !== "split") {
    return (
      <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
        <div className="relative min-h-0 flex-1">
          <SinglePanelLayer active={viewMode === "chat"}>{chatPanel}</SinglePanelLayer>
          <SinglePanelLayer active={viewMode === "canvas"}>{canvasPanel}</SinglePanelLayer>
          {viewMode === "wiki" ? (
            <SinglePanelLayer active>{wikiPanel}</SinglePanelLayer>
          ) : null}
          {viewMode === "brief" ? (
            <SinglePanelLayer active>{briefPanel}</SinglePanelLayer>
          ) : null}
          {viewMode === "nody" ? (
            <SinglePanelLayer active>{nodyPanel}</SinglePanelLayer>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={workspaceBackdropClassName}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 md:px-5 md:py-5">
        <div className="flex flex-wrap items-center gap-2">
          {splitPanes.map(({ icon: Icon, id, label }) => {
            const isOpen = splitPaneVisibility[id];
            const isLastOpenPane = isOpen && visibleSplitPanes.length === 1;

            return (
              <button
                key={id}
                type="button"
                aria-pressed={isOpen}
                aria-label={`${isOpen ? "Hide" : "Show"} ${label} pane in split`}
                disabled={isLastOpenPane}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  isOpen
                    ? "border-sky-300/80 bg-white/85 text-foreground shadow-sm dark:border-sky-400/40 dark:bg-slate-950/70"
                    : "border-border/70 bg-background/70 text-muted-foreground hover:border-sky-200 hover:text-foreground dark:bg-slate-950/40"
                } ${isLastOpenPane ? "cursor-default opacity-70" : ""}`}
                onClick={() => toggleSplitPane(id)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {isOpen ? (
                  <X className="h-3 w-3 opacity-70" />
                ) : (
                  <Plus className="h-3 w-3 opacity-70" />
                )}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={`flex h-full min-h-0 gap-3 overflow-x-auto pb-1 ${
              isSingleOpenPane ? "overflow-x-hidden" : ""
            }`}
          >
            {visibleSplitPanes.map((pane) => (
              <div
                key={pane.id}
                className={isSingleOpenPane ? "min-h-0 min-w-0 flex-1" : "min-h-0 shrink-0"}
                style={
                  isSingleOpenPane
                    ? undefined
                    : {
                        minWidth: pane.minWidth,
                        width: pane.idealWidth,
                      }
                }
              >
                <WorkspacePanelShell>{pane.panel}</WorkspacePanelShell>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
