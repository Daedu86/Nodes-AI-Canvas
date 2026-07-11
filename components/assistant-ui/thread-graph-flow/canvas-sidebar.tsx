"use client";

import {
  Copy as CopyIcon,
  Focus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Scissors,
} from "lucide-react";
import React from "react";
import {
  canvasToolbarIconButtonClassName,
  flowFilterLabel,
  LegendItem,
  type FlowDensityMode,
  type FlowRenderMode,
  type FlowSpotlightMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";

type CanvasLegendItem = {
  key: string;
  label: string;
  swatch: string;
};

type CanvasSidebarProps = {
  activeCanvasRunCount: number;
  artifactCount: number;
  children: React.ReactNode;
  connectionError: string | null;
  densityMode: FlowDensityMode;
  filterCounts: Record<FlowSpotlightMode, number>;
  flowNodeCount: number;
  flowRenderMode: FlowRenderMode;
  hiddenCanvasNodeCount: number;
  legendItems: CanvasLegendItem[];
  linkEditMode: boolean;
  onCancelAllRuns: () => void;
  onCopyJson: () => void;
  onCreatePrompt: () => void;
  onDensityModeChange: (mode: FlowDensityMode) => void;
  onFlowRenderModeChange: (mode: FlowRenderMode) => void;
  onLinkEditModeChange: (enabled: boolean) => void;
  onResetLinks: () => void;
  onSpotlightChange: (mode: FlowSpotlightMode) => void;
  onToolbarMenuChange: (menu: "add" | "tools" | null) => void;
  queuedCanvasRunCount: number;
  resetLinkCount: number;
  selectedBranchPathLabel: string;
  selectedCanvasLabel: string;
  selectedCanvasPreview: string;
  selectedNodeId: string | null;
  promptDisabled: boolean;
  showCanvasPromptCta: boolean;
  showInspector: boolean;
  spotlight: FlowSpotlightMode;
  toolbarMenu: "add" | "tools" | null;
  toolbarMenuRef: React.RefObject<HTMLDivElement | null>;
  visibleCanvasNodeCount: number;
};

export function CanvasSidebar({
  activeCanvasRunCount,
  artifactCount,
  children,
  connectionError,
  densityMode,
  filterCounts,
  flowNodeCount,
  flowRenderMode,
  hiddenCanvasNodeCount,
  legendItems,
  linkEditMode,
  onCancelAllRuns,
  onCopyJson,
  onCreatePrompt,
  onDensityModeChange,
  onFlowRenderModeChange,
  onLinkEditModeChange,
  onResetLinks,
  onSpotlightChange,
  onToolbarMenuChange,
  queuedCanvasRunCount,
  resetLinkCount,
  selectedBranchPathLabel,
  selectedCanvasLabel,
  selectedCanvasPreview,
  selectedNodeId,
  promptDisabled,
  showCanvasPromptCta,
  showInspector,
  spotlight,
  toolbarMenu,
  toolbarMenuRef,
  visibleCanvasNodeCount,
}: CanvasSidebarProps) {
  return (
    <aside
      ref={toolbarMenuRef}
      className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-[24px] border border-white/70 bg-white/84 p-3 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-slate-950/78 lg:w-[18rem] lg:max-w-[22rem]"
    >
      <div className="min-w-0 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
            Canvas
          </span>
          {selectedNodeId ? (
            <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
              Focus
            </span>
          ) : null}
          {densityMode === "focus" ? (
            <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Path mode
            </span>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
          {selectedCanvasLabel}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {selectedCanvasPreview}
        </p>
        {selectedBranchPathLabel ? (
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
            <span className="font-medium text-foreground/80">Path:</span>{" "}
            {selectedBranchPathLabel}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
            {visibleCanvasNodeCount} / {flowNodeCount} nodes
          </span>
          <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-700">
            {artifactCount} artifact{artifactCount === 1 ? "" : "s"}
          </span>
          {hiddenCanvasNodeCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
              {hiddenCanvasNodeCount} hidden
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-border/60 pb-3">
        {connectionError ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200"
          >
            {connectionError}
          </p>
        ) : null}
        {activeCanvasRunCount > 0 || queuedCanvasRunCount > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
            <span>
              {activeCanvasRunCount} running · {queuedCanvasRunCount} queued
            </span>
            <button
              type="button"
              className="font-medium text-emerald-700 dark:text-emerald-200"
              onClick={onCancelAllRuns}
            >
              Cancel all
            </button>
          </div>
        ) : null}
        {showCanvasPromptCta ? (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-55"
            onClick={onCreatePrompt}
            disabled={promptDisabled}
          >
            <Plus className="h-4 w-4 text-emerald-600" />
            <span>Create prompt node</span>
          </button>
        ) : null}
        <div className="flex items-center rounded-full border border-border/60 bg-background/92 p-1 text-[11px] font-medium text-muted-foreground shadow-sm">
          {(["2d", "3d"] as FlowRenderMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`inline-flex items-center rounded-full px-3 py-2 transition-colors ${
                flowRenderMode === mode
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onFlowRenderModeChange(mode)}
              aria-label={`Switch canvas to ${mode.toUpperCase()}`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative w-full">
          <button
            type="button"
            aria-expanded={toolbarMenu === "tools"}
            aria-haspopup="menu"
            aria-label="Canvas tools"
            className={`${canvasToolbarIconButtonClassName} w-full justify-center`}
            onClick={() =>
              onToolbarMenuChange(toolbarMenu === "tools" ? null : "tools")
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tools</span>
          </button>
          {toolbarMenu === "tools" ? (
            <div className="mt-2 w-full rounded-[18px] border border-white/70 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-slate-950/92">
              <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Canvas tools
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
                  onClick={() => {
                    onToolbarMenuChange(null);
                    onLinkEditModeChange(!linkEditMode);
                  }}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground/80">
                    <Scissors className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {linkEditMode ? "Finish Editing" : "Edit Links"}
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      Cut and restore parent-child links from the graph.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
                  onClick={() => {
                    onToolbarMenuChange(null);
                    onCopyJson();
                  }}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground/80">
                    <CopyIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      Copy JSON
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      Export the visible graph snapshot for debugging or handoff.
                    </span>
                  </span>
                </button>
              </div>
              {legendItems.length > 0 ? (
                <>
                  <div className="my-2 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-1">
                    {legendItems.slice(0, 4).map((item) => (
                      <LegendItem
                        key={item.key}
                        color={item.swatch}
                        label={item.label}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {showInspector ? (
      <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Canvas focus
              </p>
              <p className="text-xs text-foreground/80">
                {selectedNodeId
                  ? "Inspector for the current node or artifact."
                  : "Select a node or artifact to inspect and branch from it."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(flowFilterLabel) as FlowSpotlightMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors ${
                  spotlight === mode
                    ? "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:bg-background"
                }`}
                onClick={() => onSpotlightChange(mode)}
              >
                <span>{flowFilterLabel[mode]}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] dark:bg-white/10">
                  {filterCounts[mode]}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={!selectedNodeId}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                densityMode === "focus"
                  ? "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:bg-background"
              }`}
              onClick={() =>
                onDensityModeChange(
                  densityMode === "focus" ? "overview" : "focus",
                )
              }
            >
              <Focus className="h-3.5 w-3.5" />
              <span>{densityMode === "focus" ? "Focus path" : "Enter focus"}</span>
            </button>
          </div>
          {linkEditMode ? (
            <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-700 dark:text-rose-200">
              Link edit mode is on. Use{" "}
              <span className="font-semibold">Cut selected link</span> from the
              inspector, then restore it when needed.
            </p>
          ) : null}
          {resetLinkCount > 0 ? (
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/90 px-2.5 py-1.5 text-[11px] hover:bg-background"
              onClick={onResetLinks}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Cuts ({resetLinkCount})</span>
            </button>
          ) : null}
          {children}
        </div>
      ) : null}
    </aside>
  );
}
