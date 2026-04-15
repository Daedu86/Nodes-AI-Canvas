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
          autoScroll={false}
          className="flex h-full flex-col items-stretch overflow-y-auto bg-inherit px-5 py-7"
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
            <div className="sticky bottom-0 mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end gap-2 bg-inherit pb-4">
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
