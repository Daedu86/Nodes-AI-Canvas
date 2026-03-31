import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  MessagePrimitive,
  useAssistantRuntime,
  useMessage,
} from "@assistant-ui/react";
import type { FC } from "react";
import React from "react";
import {
  CornerDownRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  GitBranchPlusIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { MessageMetadata } from "@/components/assistant-ui/thread/message-metadata";
import {
  resolveRuntimeParentId,
  getBranchIdValue,
  resolveLatency,
  type MessageLike,
  resolveModel,
  resolveSiblingInfo,
} from "@/components/assistant-ui/thread/message-utils";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { useThreadRepoItems } from "@/components/assistant-ui/use-thread-repo-items";
import { useHistoryMode } from "@/components/context/history-mode";
import { useLinkEditor } from "@/components/context/link-editor";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useMessageLatencyVersion } from "@/components/context/message-latency";
import { useModelConfig } from "@/components/context/model-config";
import { useRequestError } from "@/components/context/request-error";
import { useThreadBranchDraft } from "@/components/context/thread-branch-draft";
import {
  getBranchOperationDetail,
  type BranchOperation,
  type BranchOperationDetail,
  buildBranchSpec,
} from "@/lib/thread-branching";
import { executeBranchSpec } from "@/lib/thread-branching-runtime";
import { executeAssistantEditBranch } from "@/lib/assistant-edit-runtime";
import { cn } from "@/lib/utils";

const useResolvedMessagePresentation = () => {
  const message = useMessage();
  const runtime = useAssistantRuntime();
  const messageLike = React.useMemo<MessageLike>(() => (message ?? {}) as MessageLike, [message]);
  const { getParentId } = useLinkEditor();
  const latencyVersion = useMessageLatencyVersion();
  const { modelId, provider } = useModelConfig();
  const { parentIdDisplay } = React.useMemo(
    () => resolveSiblingInfo(messageLike, runtime, getParentId),
    [getParentId, messageLike, runtime],
  );
  const resolvedParentId = React.useMemo(
    () => resolveRuntimeParentId(messageLike.id ?? null, runtime, getParentId),
    [getParentId, messageLike.id, runtime],
  );
  const branchIdValue = React.useMemo(() => getBranchIdValue(messageLike), [messageLike]);
  const modelInfo = React.useMemo(
    () => resolveModel(messageLike, modelId, provider),
    [messageLike, modelId, provider],
  );
  void latencyVersion;
  const latencyInfo = resolveLatency(messageLike);

  return {
    branchIdValue,
    latencyInfo,
    message,
    modelInfo,
    parentIdDisplay,
    resolvedParentId,
    runtime,
  };
};

const InlineBranchComposer: FC<{
  detail: BranchOperationDetail;
  text: string;
  disabled: boolean;
  busy: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}> = ({ detail, text, disabled, busy, onCancel, onChange, onSubmit }) => {
  return (
    <div className="col-span-full rounded-2xl border border-border/60 bg-background/95 px-3 py-3 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/80">{detail.title}</p>
        <p className="text-xs text-muted-foreground">{detail.description}</p>
      </div>
      <textarea
        rows={3}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder={detail.placeholder}
        disabled={disabled || busy}
        className="mt-2 min-h-[84px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500/35"
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-sky-500/35 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onSubmit}
          disabled={disabled || busy || text.trim().length === 0}
        >
          {busy ? "Creating..." : detail.submitLabel}
        </button>
      </div>
    </div>
  );
};

const InlineEditComposer: FC<{
  text: string;
  disabled: boolean;
  busy: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
}> = ({ text, disabled, busy, onCancel, onChange, onSubmit }) => {
  return (
    <div className="col-span-full rounded-2xl border border-border/60 bg-background/95 px-3 py-3 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground/80">Edit assistant branch</p>
        <p className="text-xs text-muted-foreground">
          Create an alternate assistant branch from this reply.
        </p>
      </div>
      <textarea
        rows={3}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write the edited branch prompt..."
        disabled={disabled || busy}
        className="mt-2 min-h-[84px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500/35"
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-sky-500/35 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onSubmit}
          disabled={disabled || busy || text.trim().length === 0}
        >
          {busy ? "Creating..." : "Send"}
        </button>
      </div>
    </div>
  );
};

const UserActionBar: FC<{
  branchTooltip: string;
  disabled: boolean;
  isDrafting: boolean;
  onBranch: () => void;
}> = ({ branchTooltip, disabled, isDrafting, onBranch }) => {
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
      <TooltipIconButton
        tooltip={branchTooltip}
        onClick={onBranch}
        disabled={disabled}
        className={cn(isDrafting ? "bg-sky-500/10 text-sky-700" : undefined)}
      >
        <GitBranchPlusIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Root>
  );
};

const AssistantActionBar: FC<{
  disabled: boolean;
  isEditing: boolean;
  isDrafting: boolean;
  onEdit: () => void;
  onBranch: () => void;
}> = ({ disabled, isDrafting, isEditing, onEdit, onBranch }) => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground flex gap-1 col-start-3 row-start-2 -ml-1 data-[floating]:bg-background data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      <TooltipIconButton
        tooltip="Edit"
        onClick={onEdit}
        disabled={disabled}
        className={cn(isEditing ? "bg-sky-500/10 text-sky-700" : undefined)}
      >
        <PencilIcon />
      </TooltipIconButton>
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
      <TooltipIconButton
        tooltip="Follow-up prompt"
        onClick={onBranch}
        disabled={disabled}
        className={cn(isDrafting ? "bg-sky-500/10 text-sky-700" : undefined)}
      >
        <CornerDownRightIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("text-muted-foreground inline-flex items-center text-xs", className)}
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

const getEditedFromId = (message: MessageLike | null | undefined) => {
  const custom = (message?.metadata?.custom as Record<string, unknown> | undefined) ?? {};
  const editedFrom = custom.__assistantEditedFrom;
  return typeof editedFrom === "string" ? editedFrom : null;
};

const getMessageText = (message: MessageLike | null | undefined) => {
  const content = (message as { content?: Array<{ type?: unknown; text?: unknown }> } | null | undefined)
    ?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
};

const SyntheticAssistantEditBranchBadge: FC<{
  activeBranchCount: number;
  activeBranchNumber: number;
}> = ({ activeBranchCount, activeBranchNumber }) => {
  if (activeBranchCount <= 1) return null;

  return (
    <div className="text-muted-foreground inline-flex items-center text-xs">
      <span className="font-medium">
        {activeBranchNumber} / {activeBranchCount}
      </span>
    </div>
  );
};

export const UserMessage: FC = () => {
  const {
    branchIdValue,
    latencyInfo,
    message,
    modelInfo,
    parentIdDisplay,
    resolvedParentId,
    runtime,
  } = useResolvedMessagePresentation();
  const { draft, beginDraft, cancelDraft, setDraftText } = useThreadBranchDraft();
  const { historyMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, setRequestError } = useRequestError();
  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);
  const isThreadRunning = runtime.threads.main.getState().isRunning;
  const isRootUser = resolvedParentId === null;
  const branchOperation: BranchOperation = "create-sibling-prompt";
  const activeDraft =
    draft && draft.anchorId === message?.id && draft.operation === branchOperation ? draft : null;
  const branchDetail = React.useMemo<BranchOperationDetail>(() => {
    if (isRootUser) {
      const rootDetail = getBranchOperationDetail("new-root-prompt");
      return {
        ...rootDetail,
        operation: branchOperation,
      };
    }
    return getBranchOperationDetail(branchOperation);
  }, [branchOperation, isRootUser]);

  const handleChooseBranch = React.useCallback(() => {
    if (!message?.id) return;
    beginDraft(message.id, branchOperation);
  }, [beginDraft, branchOperation, message?.id]);

  const handleSubmitBranch = React.useCallback(() => {
    if (!message?.id || !activeDraft) return;
    const spec = buildBranchSpec(
      {
        id: message.id,
        parentId: resolvedParentId,
        role: "user",
        isBridge: false,
      },
      branchOperation,
    );

    if (!spec) {
      setRequestError("Unable to branch from this message.");
      return;
    }

    clearRequestError();
    setIsSubmittingBranch(true);
    try {
      const executed = executeBranchSpec(runtime.threads.main, spec, {
        historyMode,
        modelId,
        provider,
        text: activeDraft.text,
      });

      if (!executed) {
        setRequestError("Unable to branch from this message.");
        return;
      }

      cancelDraft();
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to branch from this message.";
      setRequestError(messageText);
    } finally {
      setIsSubmittingBranch(false);
    }
  }, [
    activeDraft,
    branchOperation,
    cancelDraft,
    clearRequestError,
    historyMode,
    message?.id,
    modelId,
    provider,
    resolvedParentId,
    runtime.threads.main,
    setRequestError,
  ]);

  return (
    <MessagePrimitive.Root
      data-message-id={message?.id}
      className="grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 [&:where(>*)]:col-start-2 w-full max-w-[var(--thread-max-width)] py-4"
    >
      <UserActionBar
        branchTooltip={branchDetail.title}
        disabled={!llmEnabled || isThreadRunning}
        isDrafting={Boolean(activeDraft)}
        onBranch={handleChooseBranch}
      />

      <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-5 py-2.5 col-start-2 row-start-2">
        <MessageMetadata
          messageId={message?.id}
          parentIdDisplay={parentIdDisplay}
          branchIdValue={branchIdValue}
          latencyInfo={latencyInfo}
          role={message?.role}
          modelInfo={modelInfo}
        />
        <MessagePrimitive.Content />
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      {activeDraft ? (
        <div className="col-start-2 row-start-4 w-full max-w-[calc(var(--thread-max-width)*0.8)]">
          <InlineBranchComposer
            detail={branchDetail}
            text={activeDraft.text}
            disabled={!llmEnabled || isThreadRunning}
            busy={isSubmittingBranch}
            onCancel={cancelDraft}
            onChange={setDraftText}
            onSubmit={handleSubmitBranch}
          />
        </div>
      ) : null}
    </MessagePrimitive.Root>
  );
};

export const AssistantMessage: FC = () => {
  const { branchIdValue, latencyInfo, message, modelInfo, parentIdDisplay, runtime } =
    useResolvedMessagePresentation();
  const { draft, beginDraft, cancelDraft, setDraftText } = useThreadBranchDraft();
  const { historyMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, setRequestError } = useRequestError();
  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);
  const [assistantEditText, setAssistantEditText] = React.useState("");
  const [isEditingAssistant, setIsEditingAssistant] = React.useState(false);
  const [isSubmittingAssistantEdit, setIsSubmittingAssistantEdit] = React.useState(false);
  const isThreadRunning = runtime.threads.main.getState().isRunning;
  const runtimeBranchCount = (message as { branchCount?: number } | null)?.branchCount ?? 1;
  const branchOperation: BranchOperation = "create-follow-up-prompt";
  const activeDraft =
    draft && draft.anchorId === message?.id && draft.operation === branchOperation ? draft : null;
  const branchDetail = getBranchOperationDetail(branchOperation);
  const { items: repoItems, order } = useThreadRepoItems(runtime, {
    defaultModel: { modelId, provider },
  });
  const syntheticAssistantBranch = React.useMemo(() => {
    const messageId = message?.id;
    if (!messageId) return { activeBranchCount: 1, activeBranchNumber: 1 };
    if (runtimeBranchCount > 1) return { activeBranchCount: 1, activeBranchNumber: 1 };

    const assistantItems = repoItems.filter((item) => item.message?.role === "assistant");
    const editsBySource = new Map<string, typeof assistantItems>();
    assistantItems.forEach((item) => {
      const editedFromId = getEditedFromId(item.message as MessageLike);
      if (!editedFromId) return;
      const list = editsBySource.get(editedFromId) ?? [];
      list.push(item);
      editsBySource.set(editedFromId, list);
    });

    const messageEditedFromId = getEditedFromId(message as MessageLike);
    const groupKey = messageEditedFromId ?? (editsBySource.has(messageId) ? messageId : null);
    if (!groupKey) return { activeBranchCount: 1, activeBranchNumber: 1 };

    const sourceItem = assistantItems.find((item) => item.message?.id === groupKey);
    const edits = editsBySource.get(groupKey) ?? [];
    const group = [sourceItem, ...edits]
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => {
        const leftOrder = left.message?.id ? order.get(left.message.id) ?? 0 : 0;
        const rightOrder = right.message?.id ? order.get(right.message.id) ?? 0 : 0;
        return leftOrder - rightOrder;
      });

    if (group.length <= 1) return { activeBranchCount: 1, activeBranchNumber: 1 };

    const visibleIds = new Set(runtime.threads.main.getState().messages.map((entry) => entry.id));
    const activeBranch =
      [...group].reverse().find((item) => item.message?.id && visibleIds.has(item.message.id)) ??
      group[group.length - 1];
    const activeId = activeBranch?.message?.id ?? messageId;
    const activeBranchNumber = Math.max(
      1,
      group.findIndex((item) => item.message?.id === activeId) + 1,
    );

    return {
      activeBranchCount: group.length,
      activeBranchNumber,
    };
  }, [message, order, repoItems, runtime, runtimeBranchCount]);

  const handleChooseBranch = React.useCallback(() => {
    if (!message?.id) return;
    setIsEditingAssistant(false);
    beginDraft(message.id, branchOperation);
  }, [beginDraft, branchOperation, message?.id]);

  const handleChooseEdit = React.useCallback(() => {
    cancelDraft();
    setAssistantEditText(getMessageText(message as MessageLike));
    setIsEditingAssistant(true);
  }, [cancelDraft, message]);

  const handleCancelEdit = React.useCallback(() => {
    setAssistantEditText("");
    setIsEditingAssistant(false);
  }, []);

  const handleSubmitEdit = React.useCallback(async () => {
    if (!message?.id) return;
    clearRequestError();
    setIsSubmittingAssistantEdit(true);
    try {
      const executed = await executeAssistantEditBranch(runtime.threads.main, {
        historyMode,
        modelId,
        parentId: message.parentId ?? null,
        provider,
        sourceId: message.id,
        text: assistantEditText,
      });

      if (!executed) {
        setRequestError("Unable to create an edited assistant branch.");
        return;
      }

      setAssistantEditText("");
      setIsEditingAssistant(false);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to create an edited assistant branch.";
      setRequestError(messageText);
    } finally {
      setIsSubmittingAssistantEdit(false);
    }
  }, [
    assistantEditText,
    clearRequestError,
    historyMode,
    message?.id,
    message?.parentId,
    modelId,
    provider,
    runtime.threads.main,
    setRequestError,
  ]);

  const handleSubmitBranch = React.useCallback(() => {
    if (!message?.id || !activeDraft) return;
    const spec = buildBranchSpec(
      {
        id: message.id,
        parentId: message.parentId ?? null,
        role: "assistant",
        isBridge: false,
      },
      branchOperation,
    );

    if (!spec) {
      setRequestError("Unable to branch from this message.");
      return;
    }

    clearRequestError();
    setIsSubmittingBranch(true);
    try {
      const executed = executeBranchSpec(runtime.threads.main, spec, {
        historyMode,
        modelId,
        provider,
        text: activeDraft.text,
      });

      if (!executed) {
        setRequestError("Unable to branch from this message.");
        return;
      }

      cancelDraft();
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to branch from this message.";
      setRequestError(messageText);
    } finally {
      setIsSubmittingBranch(false);
    }
  }, [
    activeDraft,
    branchOperation,
    cancelDraft,
    clearRequestError,
    historyMode,
    message?.id,
    message?.parentId,
    modelId,
    provider,
    runtime.threads.main,
    setRequestError,
  ]);

  return (
    <MessagePrimitive.Root
      data-message-id={message?.id}
      className="grid grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] relative w-full max-w-[var(--thread-max-width)] py-4"
    >
      <div className="text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7 col-span-2 col-start-2 row-start-1 my-1.5">
        <MessageMetadata
          messageId={message?.id}
          parentIdDisplay={parentIdDisplay}
          branchIdValue={branchIdValue}
          latencyInfo={latencyInfo}
          role={message?.role}
          modelInfo={modelInfo}
        />
        <MessagePrimitive.Content
          components={{ Text: MarkdownText, tools: { Fallback: ToolFallback } }}
        />
      </div>

      <AssistantActionBar
        disabled={!llmEnabled || isThreadRunning}
        isEditing={isEditingAssistant}
        isDrafting={Boolean(activeDraft)}
        onEdit={handleChooseEdit}
        onBranch={handleChooseBranch}
      />

      <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
      <div className="pointer-events-none col-start-3 row-start-2 flex items-start">
        <SyntheticAssistantEditBranchBadge
          activeBranchCount={syntheticAssistantBranch.activeBranchCount}
          activeBranchNumber={syntheticAssistantBranch.activeBranchNumber}
        />
      </div>
      {activeDraft ? (
        <div className="col-span-2 col-start-2 row-start-3 mt-2 max-w-[calc(var(--thread-max-width)*0.8)]">
          <InlineBranchComposer
            detail={branchDetail}
            text={activeDraft.text}
            disabled={!llmEnabled || isThreadRunning}
            busy={isSubmittingBranch}
            onCancel={cancelDraft}
            onChange={setDraftText}
            onSubmit={handleSubmitBranch}
          />
        </div>
      ) : null}
      {isEditingAssistant ? (
        <div className="col-span-2 col-start-2 row-start-3 mt-2 max-w-[calc(var(--thread-max-width)*0.8)]">
          <InlineEditComposer
            text={assistantEditText}
            disabled={!llmEnabled || isThreadRunning}
            busy={isSubmittingAssistantEdit}
            onCancel={handleCancelEdit}
            onChange={setAssistantEditText}
            onSubmit={handleSubmitEdit}
          />
        </div>
      ) : null}
    </MessagePrimitive.Root>
  );
};
