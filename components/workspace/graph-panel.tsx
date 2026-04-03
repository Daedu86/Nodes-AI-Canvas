"use client";

import dynamic from "next/dynamic";
import { Workflow } from "lucide-react";

const ThreadGraphFlow = dynamic(
  () =>
    import("@/components/assistant-ui/thread-graph-flow/thread-graph-flow").then(
      (mod) => mod.ThreadGraphFlow,
    ),
  {
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        Loading graph…
      </div>
    ),
    ssr: false,
  },
);

export function GraphPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">Canvas</div>
        <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300">
          <Workflow className="h-3.5 w-3.5" />
          <span>Live graph</span>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ThreadGraphFlow />
      </div>
    </div>
  );
}
