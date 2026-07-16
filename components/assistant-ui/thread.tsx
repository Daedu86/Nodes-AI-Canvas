import { ThreadPrimitive } from "@assistant-ui/react";
import type { FC } from "react";
import {
  Composer,
  EditComposer,
} from "@/components/assistant-ui/thread/thread-composer";
import {
  AssistantMessage,
  UserMessage,
} from "@/components/assistant-ui/thread/thread-messages";
import {
  ThreadScrollToBottom,
  ThreadWelcome,
} from "@/components/assistant-ui/thread/thread-welcome";
import { ThreadBranchDraftProvider } from "@/components/context/thread-branch-draft";

export const Thread: FC = () => {
  return (
    <ThreadBranchDraftProvider>
      <ThreadPrimitive.Root
        className="box-border flex h-full flex-col overflow-hidden bg-transparent"
        style={{
          ["--thread-max-width" as string]: "52rem",
        }}
      >
        <ThreadPrimitive.Viewport
          autoScroll
          data-testid="thread-viewport"
          className="flex h-full scroll-pb-40 flex-col items-stretch overflow-y-auto bg-inherit px-5 py-7"
        >
          <ThreadWelcome />

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              EditComposer,
              AssistantMessage,
            }}
          />

          <ThreadPrimitive.If empty>
            <div className="mt-6 flex w-full max-w-[var(--thread-max-width)] flex-col items-center gap-3 pb-6">
              <Composer />
            </div>
          </ThreadPrimitive.If>

          <ThreadPrimitive.If empty={false}>
            <div aria-hidden className="h-32 w-full shrink-0 sm:h-28" />
            <div className="sticky bottom-0 z-20 mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end gap-2 bg-background/95 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_34px_-28px_rgba(15,23,42,0.45)] backdrop-blur-md">
              <ThreadScrollToBottom />
              <Composer />
            </div>
          </ThreadPrimitive.If>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </ThreadBranchDraftProvider>
  );
};

export { Composer };
