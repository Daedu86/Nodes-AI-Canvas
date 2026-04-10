"use client";

import { Thread } from "@/components/assistant-ui/thread";

export const ChatPanel = () => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-border/80 bg-card/92">
      <Thread />
    </div>
  );
};
