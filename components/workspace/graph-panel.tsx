"use client";

import dynamic from "next/dynamic";

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
    <div className="h-full min-h-0">
      <ThreadGraphFlow />
    </div>
  );
}
