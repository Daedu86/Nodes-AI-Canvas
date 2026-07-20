"use client";

import React from "react";
import { ThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow";

const CANVAS_RECOVERY_KEY = "nodes.canvas-recovery-reload.v1";

const isRecoverableCanvasLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch module/i.test(
    message,
  );
};

class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (typeof window === "undefined" || !isRecoverableCanvasLoadError(error)) return;
    try {
      if (window.sessionStorage.getItem(CANVAS_RECOVERY_KEY) === "1") return;
      window.sessionStorage.setItem(CANVAS_RECOVERY_KEY, "1");
      window.location.reload();
    } catch {
      // The visible recovery action remains available below.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-border/60 bg-background p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-sm font-medium text-foreground">Canvas needs to recover.</p>
          <p className="text-sm text-muted-foreground">
            The Canvas view failed to load correctly. Reload it without losing the saved conversation.
          </p>
          <button
            type="button"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
            onClick={() => window.location.reload()}
          >
            Reload Canvas
          </button>
        </div>
      </div>
    );
  }
}

export function GraphPanel() {
  React.useEffect(() => {
    try {
      window.sessionStorage.removeItem(CANVAS_RECOVERY_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
  }, []);

  return (
    <CanvasErrorBoundary>
      <div className="h-full min-h-0">
        <ThreadGraphFlow />
      </div>
    </CanvasErrorBoundary>
  );
}
