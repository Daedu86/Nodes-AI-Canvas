"use client";

import { Thread } from "@/components/assistant-ui/thread";

export const ChatPanel = () => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <Thread />
    </div>
  );
};
