"use client";

import { Thread } from "@/components/assistant-ui/thread";

export const ChatPanel = () => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-border/70 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.10),transparent_42%),radial-gradient(circle_at_bottom,rgba(236,72,153,0.06),transparent_46%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] shadow-[0_35px_90px_-70px_rgba(2,6,23,0.5)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_44%),radial-gradient(circle_at_bottom,rgba(168,85,247,0.10),transparent_48%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.86))]">
      <Thread />
    </div>
  );
};
