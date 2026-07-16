"use client";

import React from "react";
import {
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
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-hidden rounded-[18px] bg-background/90";
const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";

const WorkspacePanelShell = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <section aria-label={label} className={shellClassName}>
    <div className={shellInnerClassName}>{children}</div>
  </section>
);

const SinglePanelLayer = ({
  active,
  children,
  label,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
}) => (
  <div
    aria-hidden={!active}
    inert={!active}
    className={
      active
        ? "absolute inset-0 z-10"
        : "pointer-events-none absolute inset-0 opacity-0"
    }
  >
    <WorkspacePanelShell label={label}>{children}</WorkspacePanelShell>
  </div>
);

export function WorkspaceSplitLayout({
  chatPanel,
  canvasPanel,
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
    ],
    [canvasPanel, chatPanel],
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
          <SinglePanelLayer active={viewMode === "chat"} label="Chat workspace">
            {chatPanel}
          </SinglePanelLayer>
          <SinglePanelLayer active={viewMode === "canvas"} label="Canvas workspace">
            {canvasPanel}
          </SinglePanelLayer>
        </div>
      </div>
    );
  }

  return (
    <div className={workspaceBackdropClassName}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 md:px-5 md:py-5">
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border/70 bg-card/72 px-2 py-2">
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
                    ? "border-border/90 bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground"
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
            {visibleSplitPanes.map((pane) => {
              const isFlexibleCanvas = !isSingleOpenPane && pane.id === "canvas";

              return (
                <div
                  key={pane.id}
                  className={
                    isSingleOpenPane || isFlexibleCanvas
                      ? "min-h-0 min-w-0 flex-1"
                      : "min-h-0 shrink-0"
                  }
                  style={
                    isSingleOpenPane
                      ? undefined
                      : isFlexibleCanvas
                        ? { minWidth: pane.minWidth }
                        : {
                            minWidth: pane.minWidth,
                            width: pane.idealWidth,
                          }
                  }
                >
                  <WorkspacePanelShell label={`${pane.label} workspace`}>
                    {pane.panel}
                  </WorkspacePanelShell>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
