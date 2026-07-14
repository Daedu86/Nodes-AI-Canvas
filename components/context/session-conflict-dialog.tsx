"use client";

import type { SessionConflictState } from "@/lib/client/session-persistence";

type SessionConflictDialogProps = {
  conflict: SessionConflictState | null;
  isResolving: boolean;
  onKeepLocal: () => void;
  onLoadLatest: () => void;
};

export function SessionConflictDialog({
  conflict,
  isResolving,
  onKeepLocal,
  onLoadLatest,
}: SessionConflictDialogProps) {
  if (!conflict) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-conflict-title"
      aria-describedby="session-conflict-description"
      className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-amber-500/40 bg-background/95 p-4 shadow-2xl backdrop-blur"
    >
      <p id="session-conflict-title" className="text-sm font-semibold text-foreground">
        Session changed elsewhere
      </p>
      <p
        id="session-conflict-description"
        className="mt-1 text-sm text-muted-foreground"
      >
        Another tab, device, or agent saved a newer version. Choose which version
        should remain.
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          onClick={onLoadLatest}
          disabled={isResolving}
        >
          Load latest
        </button>
        <button
          type="button"
          className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
          onClick={onKeepLocal}
          disabled={isResolving}
        >
          {isResolving ? "Saving…" : "Keep my changes"}
        </button>
      </div>
    </div>
  );
}
