"use client";

import {
  Crosshair,
  FilePlus2,
  Focus,
  RotateCcw,
  Scissors,
  Sparkles,
  Unlink2,
} from "lucide-react";
import React from "react";
import { GraphBranchActions } from "@/components/assistant-ui/thread-graph-flow/graph-branch-actions";
import {
  artifactAccent,
  artifactTypeLabel,
  trimArtifactPreview,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import { ROOT_NODE_ID } from "@/components/assistant-ui/thread-graph/graph-types";
import type { SessionArtifact } from "@/lib/session-artifacts";

type BranchActionsProps = React.ComponentProps<typeof GraphBranchActions>;

type CanvasMessageInspectorProps = {
  activeDraft: BranchActionsProps["activeDraft"];
  artifacts: SessionArtifact[];
  busy: BranchActionsProps["busy"];
  contextCount: number;
  details: BranchActionsProps["details"];
  disabled: boolean;
  isLinkedToTarget: (artifactId: string) => boolean;
  linkEditMode: boolean;
  onCancelDraft: BranchActionsProps["onCancelDraft"];
  onCancelRun?: BranchActionsProps["onCancelRun"];
  onChooseOperation: BranchActionsProps["onChooseOperation"];
  onClearFocus: () => void;
  onCutSelected: () => void;
  onDraftTextChange: BranchActionsProps["onDraftTextChange"];
  onFocusSelected: () => void;
  onOpenInChat: () => void;
  onResetView: () => void;
  onRestoreSelected: () => void;
  onSubmitDraft: BranchActionsProps["onSubmitDraft"];
  onToggleArtifactLink: (artifactId: string) => void;
  runInterruptionNote: BranchActionsProps["runInterruptionNote"];
  selectedBranchPathLabel: string;
  selectedFlowNode: ThreadGraphFlowNode;
  selectedNodeId: string | null;
  selectedOverride: boolean;
  selectedParentId: string | null;
  selectedPreview: string;
};

export function CanvasMessageInspector({
  activeDraft,
  artifacts,
  busy,
  contextCount,
  details,
  disabled,
  isLinkedToTarget,
  linkEditMode,
  onCancelDraft,
  onCancelRun,
  onChooseOperation,
  onClearFocus,
  onCutSelected,
  onDraftTextChange,
  onFocusSelected,
  onOpenInChat,
  onResetView,
  onRestoreSelected,
  onSubmitDraft,
  onToggleArtifactLink,
  runInterruptionNote,
  selectedBranchPathLabel,
  selectedFlowNode,
  selectedNodeId,
  selectedOverride,
  selectedParentId,
  selectedPreview,
}: CanvasMessageInspectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                borderColor: `${selectedFlowNode.data.accent ?? "#64748b"}55`,
                color: selectedFlowNode.data.accent ?? "#64748b",
              }}
            >
              {selectedFlowNode.data.role}
            </span>
            {selectedFlowNode.data.branchId ? (
              <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {String(selectedFlowNode.data.branchId)}
              </span>
            ) : null}
            {selectedFlowNode.data.isCut ? (
              <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-rose-700">
                Cut
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedFlowNode.data.isCut
              ? "This node is temporarily disconnected from its original parent."
              : "Selecting a node spotlights both its lineage and any linked context artifacts."}
          </p>
        </div>
        <Sparkles className="h-4 w-4 text-sky-600" />
      </div>

      <p className="line-clamp-2 text-sm text-foreground/90">
        {selectedPreview || "No preview available"}
      </p>
      {selectedBranchPathLabel ? (
        <p className="rounded-2xl border border-border/60 bg-background/85 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground/80">Path:</span>{" "}
          {selectedBranchPathLabel}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {selectedNodeId !== ROOT_NODE_ID ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
            onClick={onOpenInChat}
          >
            <Focus className="h-3.5 w-3.5" />
            <span>Open in chat</span>
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
          onClick={onFocusSelected}
        >
          <Crosshair className="h-3.5 w-3.5" />
          <span>Fit selection</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
          onClick={onResetView}
        >
          <span>Reset view</span>
        </button>
        {linkEditMode && !selectedOverride && selectedParentId ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-500/15"
            onClick={onCutSelected}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Cut selected link</span>
          </button>
        ) : null}
        {selectedOverride ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-500/15"
            onClick={onRestoreSelected}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restore link</span>
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
          onClick={onClearFocus}
        >
          <span>Clear focus</span>
        </button>
      </div>

      <GraphBranchActions
        activeDraft={activeDraft}
        busy={busy}
        contextCount={contextCount}
        disabled={disabled}
        details={details}
        onCancelDraft={onCancelDraft}
        onCancelRun={onCancelRun}
        onChooseOperation={onChooseOperation}
        onDraftTextChange={onDraftTextChange}
        onSubmitDraft={onSubmitDraft}
        runInterruptionNote={runInterruptionNote}
      />

      <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/80">
            Linked context artifacts
          </p>
          <p className="text-xs text-muted-foreground">
            Attach reusable artifacts to this node. Branches created from here
            will include the linked artifacts as additional LLM context.
          </p>
        </div>
        {artifacts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No artifacts yet. Create one from the block library.
          </p>
        ) : (
          <div className="space-y-2">
            {artifacts.map((artifact) => {
              const isLinked = isLinkedToTarget(artifact.id);
              return (
                <div
                  key={artifact.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    isLinked
                      ? "border-violet-500/30 bg-violet-500/10"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{
                          borderColor: `${artifactAccent(artifact)}44`,
                          color: artifactAccent(artifact),
                        }}
                      >
                        {artifactTypeLabel(artifact)}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground/85">
                        {artifact.title}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {trimArtifactPreview(artifact)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${
                      isLinked
                        ? "border-violet-500/35 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15"
                        : "border-border/60 bg-background hover:bg-muted"
                    }`}
                    onClick={() => onToggleArtifactLink(artifact.id)}
                  >
                    {isLinked ? (
                      <Unlink2 className="h-3.5 w-3.5" />
                    ) : (
                      <FilePlus2 className="h-3.5 w-3.5" />
                    )}
                    <span>{isLinked ? "Detach" : "Attach"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
