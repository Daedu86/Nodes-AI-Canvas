import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
  useComposerRuntime,
} from "@assistant-ui/react";
import type { FC } from "react";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { ToolFallback } from "./tool-fallback";
import { useAssistantRuntime } from "@assistant-ui/react";
import { useHistoryMode } from "@/components/context/history-mode";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import React from "react";
import { computeSiblingGroupId } from "@/lib/sibling-group";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="bg-background box-border flex h-full flex-col overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "42rem",
      }}
    >
      <ThreadPrimitive.Viewport
        autoScroll={false}
        className="flex h-full flex-col items-center overflow-y-scroll scroll-smooth bg-inherit px-4 pt-8"
      >
        <ThreadWelcome />

        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessage,
            EditComposer: EditComposer,
            AssistantMessage: AssistantMessage,
          }}
        />

        <ThreadPrimitive.If empty={false}>
          <div className="min-h-8 flex-grow" />
        </ThreadPrimitive.If>

        <div className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="w-full max-w-[var(--thread-max-width)] space-y-6 py-6">
        <div>
          <p className="text-lg font-semibold">How can I help you today?</p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  const { llmEnabled } = useLlmEnabled();
  return (
    <div className="mt-3 flex w-full items-stretch justify-center gap-4">
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="What is the weather in Tokyo?"
        method="replace"
        autoSend={llmEnabled}
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          What is the weather in Tokyo?
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
        prompt="What is assistant-ui?"
        method="replace"
        autoSend={llmEnabled}
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          What is assistant-ui?
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

const Composer: FC = () => {
  const composer = useComposerRuntime();
  const { historyMode, setHistoryMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();

  React.useEffect(() => {
    try {
      composer.setRunConfig({ custom: { historyMode } });
    } catch {}
  }, [historyMode, composer]);

  return (
    <ComposerPrimitive.Root className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in">
      <div className="flex w-full items-end gap-2">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Write a message..."
          disabled={!llmEnabled}
          className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
        />
        <ComposerAction />
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">History:</span>
        <Button
          type="button" variant={historyMode === "last" ? "default" : "outline"}
          size="sm"
          onClick={() => setHistoryMode("last")}
        >
          Last
        </Button>
        <Button
          type="button" variant={historyMode === "full" ? "default" : "outline"}
          size="sm"
          onClick={() => setHistoryMode("full")}
        >
          Full
        </Button>
      </div>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  const { llmEnabled } = useLlmEnabled();
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            disabled={!llmEnabled}
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <SendHorizontalIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            disabled={!llmEnabled}
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  const message = useMessage();
  const runtime = useAssistantRuntime();
  const { siblingIdStr, parentIdDisplay } = React.useMemo(() => {
    try {
      const id = String((message as any)?.id ?? "");
      const parentId = (message as any)?.parentId ?? null;
      if (!id) return { siblingIdStr: "", parentIdDisplay: (message as any)?.parentId ?? null };
      // Implicit siblings: messages that share the same parent
      const exp = (runtime as any)?.threads?.main?.export?.();
      const items: any[] = Array.isArray(exp?.messages) ? (exp!.messages as any[]) : [];
      let hasSibling = false;
      for (const it of items) {
        const mid = String(it?.message?.id ?? "");
        const p = it?.parentId ?? null;
        if (mid && mid !== id && p === parentId) { hasSibling = true; break; }
      }
      if (hasSibling && typeof parentId === "string" && parentId.length > 0) {
        return { siblingIdStr: computeSiblingGroupId(parentId), parentIdDisplay: parentId };
      }
      return { siblingIdStr: "", parentIdDisplay: parentId };
    } catch { return { siblingIdStr: "", parentIdDisplay: (message as any)?.parentId ?? null }; }
  }, [runtime, message?.id]);
  return (
    <MessagePrimitive.Root data-message-id={message?.id} className="grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 [&:where(>*)]:col-start-2 w-full max-w-[var(--thread-max-width)] py-4">
      <UserActionBar />

      <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-5 py-2.5 col-start-2 row-start-2">
        {/* Datos del mensaje */}
        <div className="text-xs text-muted-foreground mb-1">
          <div><b>id:</b> {message?.id ?? '-'}</div>
          <div><b>parentId:</b> {parentIdDisplay ?? '-'}</div>
          <div><b>siblingId:</b> {siblingIdStr || '-'}</div>
          {"branchId" in (message ?? {}) && (
            <div><b>branchId:</b> {(message as any)?.branchId ?? '-'}</div>
          )}
          <div><b>type:</b> {message?.role ?? '-'}</div>
        </div>
        <MessagePrimitive.Content />
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end col-start-1 row-start-2 mr-3 mt-2.5"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const composer = useComposerRuntime();
  const message = useMessage();
  const { historyMode, setHistoryMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const runtime = useAssistantRuntime();

  const handleSend = () => {
    if (!llmEnabled) return;
    const state = composer.getState();
    const text = state.text.trim();
    if (!text) return;
    composer.setRunConfig({ custom: { historyMode } });
    composer.send();
  };

  const handleCancel = () => {
    composer.cancel();
  };

  return (
    <ComposerPrimitive.Root className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl">
      <ComposerPrimitive.Input
        className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none"
        disabled={!llmEnabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <div className="mx-3 mb-3 flex items-center justify-end gap-2">
        <div className="mr-auto flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">History:</span>
          <Button
            type="button" variant={historyMode === "last" ? "default" : "outline"}
            size="sm"
            onClick={() => setHistoryMode("last")}
          >
            Last
          </Button>
          <Button
            type="button" variant={historyMode === "full" ? "default" : "outline"}
            size="sm"
            onClick={() => setHistoryMode("full")}
          >
            Full
          </Button>
        </div>
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={!llmEnabled}>Cancel</Button>
        <Button type="button" onClick={handleSend} disabled={!llmEnabled}>Send</Button>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  const message = useMessage();
  const runtime = useAssistantRuntime();
  const { siblingIdStr, parentIdDisplay } = React.useMemo(() => {
    try {
      const id = String((message as any)?.id ?? "");
      const parentId = (message as any)?.parentId ?? null;
      if (!id) return { siblingIdStr: "", parentIdDisplay: (message as any)?.parentId ?? null };
      // Implicit siblings: messages that share the same parent
      const exp = (runtime as any)?.threads?.main?.export?.();
      const items: any[] = Array.isArray(exp?.messages) ? (exp!.messages as any[]) : [];
      let hasSibling = false;
      for (const it of items) {
        const mid = String(it?.message?.id ?? "");
        const p = it?.parentId ?? null;
        if (mid && mid !== id && p === parentId) { hasSibling = true; break; }
      }
      if (hasSibling && typeof parentId === "string" && parentId.length > 0) {
        return { siblingIdStr: computeSiblingGroupId(parentId), parentIdDisplay: parentId };
      }
      return { siblingIdStr: "", parentIdDisplay: parentId };
    } catch { return { siblingIdStr: "", parentIdDisplay: (message as any)?.parentId ?? null }; }
  }, [runtime, message?.id]);
  return (
    <MessagePrimitive.Root data-message-id={message?.id} className="grid grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] relative w-full max-w-[var(--thread-max-width)] py-4">
      <div className="text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7 col-span-2 col-start-2 row-start-1 my-1.5">
        {/* Datos del mensaje */}
        <div className="text-xs text-muted-foreground mb-1">
          <div><b>id:</b> {message?.id ?? '-'}</div>
          <div><b>parentId:</b> {parentIdDisplay ?? '-'}</div>
          <div><b>siblingId:</b> {siblingIdStr || '-'}</div>
          {"branchId" in (message ?? {}) && (
            <div><b>branchId:</b> {(message as any)?.branchId ?? '-'}</div>
          )}
          <div><b>type:</b> {message?.role ?? '-'}</div>
        </div>
        <MessagePrimitive.Content
          components={{ Text: MarkdownText, tools: { Fallback: ToolFallback } }}
        />
      </div>

      <AssistantActionBar />

      <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground flex gap-1 col-start-3 row-start-2 -ml-1 data-[floating]:bg-background data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      {/* Botón Editar para el asistente */}
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground inline-flex items-center text-xs",
        className
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};


















