"use client";

import React from "react";
import type { BranchOperation, BranchOperationDetail } from "@/lib/thread-branching";
import { Button } from "@/components/ui/button";

type GraphBranchActionsProps = {
  activeDraft: { operation: BranchOperation; text: string } | null;
  busy?: boolean;
  contextCount?: number;
  disabled?: boolean;
  details: BranchOperationDetail[];
  onCancelDraft: () => void;
  onChooseOperation: (operation: BranchOperation) => void;
  onDraftTextChange: (value: string) => void;
  onSubmitDraft: () => void;
};

export function GraphBranchActions({
  activeDraft,
  busy = false,
  contextCount = 0,
  disabled = false,
  details,
  onCancelDraft,
  onChooseOperation,
  onDraftTextChange,
  onSubmitDraft,
}: GraphBranchActionsProps) {
  if (details.length === 0 && !activeDraft) return null;

  const activeDetail = activeDraft
    ? details.find((detail) => detail.operation === activeDraft.operation) ?? null
    : null;

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/80">Branch from canvas</p>
        <p className="text-xs text-muted-foreground">
          Create a new branch on the same thread structure used by the chat.
        </p>
        {contextCount > 0 ? (
          <p className="text-xs text-violet-700">
            Using {contextCount} linked context artifact{contextCount === 1 ? "" : "s"} for the next branch.
          </p>
        ) : null}
      </div>

      {activeDraft && activeDetail ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/80">{activeDetail.title}</p>
            <p className="text-xs text-muted-foreground">{activeDetail.description}</p>
          </div>
          <textarea
            rows={3}
            value={activeDraft.text}
            onChange={(event) => onDraftTextChange(event.target.value)}
            placeholder={activeDetail.placeholder}
            disabled={disabled || busy}
            className="min-h-[84px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500/35"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="pointer-events-auto w-full sm:w-auto"
              onClick={onCancelDraft}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="pointer-events-auto w-full sm:w-auto"
              onClick={onSubmitDraft}
              disabled={disabled || busy || activeDraft.text.trim().length === 0}
            >
              {busy
                ? "Creating..."
                : contextCount > 0
                  ? `${activeDetail.submitLabel} with context`
                  : activeDetail.submitLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {details.map((detail) => (
            <button
              key={detail.operation}
              type="button"
              onClick={() => onChooseOperation(detail.operation)}
              disabled={disabled || busy}
              className="pointer-events-auto inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {detail.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
