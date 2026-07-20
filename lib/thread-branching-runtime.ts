import type { ThreadRuntime } from "@assistant-ui/react";
import type { HistoryMode, ModelProvider } from "@/components/context/session-ui-state";
import type { ContextScope } from "@/components/context/graph-branch-intent";
import { packFullTreeContextMessages } from "@/lib/full-tree-context";
import type { BranchSpec } from "@/lib/thread-branching";
import {
  getOutputFormatInstruction,
  type LlmContextArtifact,
  type SessionArtifactSemanticType,
} from "@/lib/session-artifacts";

type InternalThreadRuntime = ThreadRuntime & {
  __internal_threadBinding?: {
    getState?: () => {
      append?: (message: ReturnType<typeof buildBranchAppendMessage>) => void;
    };
  };
};

export type ExecuteBranchSpecOptions = {
  contextArtifacts?: LlmContextArtifact[];
  contextNodeIds?: string[];
  inputArtifactIds?: string[];
  outputArtifactIds?: string[];
  outputArtifactTypes?: Array<SessionArtifactSemanticType | null | undefined>;
  historyMode: HistoryMode;
  contextScope?: ContextScope | null;
  contextMessages?: Array<{ id?: string; role: "system" | "user" | "assistant"; content: string }>;
  requireContextScope?: boolean;
  modelId: string;
  provider: ModelProvider;
  text: string;
};

type ScopedContextMessage = NonNullable<ExecuteBranchSpecOptions["contextMessages"]>[number];

const MAX_DURABLE_TREE_CONTEXT_CHARS = 32 * 1024;
const MAX_DURABLE_TREE_CONTEXT_MESSAGES = 48;
const MAX_DURABLE_TREE_MESSAGE_CHARS = 4 * 1024;
const MAX_DURABLE_TREE_PROMPT_CHARS = 8 * 1024;
const DURABLE_TREE_TRUNCATION_MESSAGE: ScopedContextMessage = {
  role: "system",
  content:
    "[Full tree context truncated in durable metadata. The live request still uses a compact provider-safe tree reference.]",
};

const uniqueIds = (value: string[] | undefined) =>
  value ? Array.from(new Set(value.filter(Boolean))) : [];

const truncateDurableTreeMessage = (
  message: ScopedContextMessage,
  maxChars = MAX_DURABLE_TREE_MESSAGE_CHARS,
): ScopedContextMessage => {
  if (message.content.length <= maxChars) return message;
  return {
    ...message,
    content: `${message.content.slice(0, Math.max(0, maxChars - 24))}\n[... truncated ...]`,
  };
};

const getSerializedMessageSize = (message: ScopedContextMessage) =>
  JSON.stringify(message).length;

const boundDurableTreeContextMessages = (
  contextMessages: ScopedContextMessage[],
): ScopedContextMessage[] => {
  if (contextMessages.length === 0) return [];

  const currentPrompt = truncateDurableTreeMessage(
    contextMessages.at(-1)!,
    MAX_DURABLE_TREE_PROMPT_CHARS,
  );
  const history = contextMessages
    .slice(0, -1)
    .map((message) => truncateDurableTreeMessage(message));
  const normalized = [...history, currentPrompt];

  if (
    normalized.length <= MAX_DURABLE_TREE_CONTEXT_MESSAGES &&
    JSON.stringify(normalized).length <= MAX_DURABLE_TREE_CONTEXT_CHARS
  ) {
    return normalized;
  }

  const markerSize = getSerializedMessageSize(DURABLE_TREE_TRUNCATION_MESSAGE);
  const promptSize = getSerializedMessageSize(currentPrompt);
  const headBudget = Math.floor(MAX_DURABLE_TREE_CONTEXT_CHARS / 3);
  let totalSize = markerSize + promptSize + 4;
  const head: ScopedContextMessage[] = [];
  const tail: ScopedContextMessage[] = [];
  const headIndexes = new Set<number>();

  for (let index = 0; index < history.length; index += 1) {
    if (head.length >= 6) break;
    const candidate = history[index]!;
    const candidateSize = getSerializedMessageSize(candidate) + 1;
    if (totalSize + candidateSize > headBudget) break;
    head.push(candidate);
    headIndexes.add(index);
    totalSize += candidateSize;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (headIndexes.has(index)) continue;
    if (head.length + tail.length + 2 >= MAX_DURABLE_TREE_CONTEXT_MESSAGES) break;
    const candidate = history[index]!;
    const candidateSize = getSerializedMessageSize(candidate) + 1;
    if (totalSize + candidateSize > MAX_DURABLE_TREE_CONTEXT_CHARS) break;
    tail.push(candidate);
    totalSize += candidateSize;
  }

  return [
    ...head,
    DURABLE_TREE_TRUNCATION_MESSAGE,
    ...tail.reverse(),
    currentPrompt,
  ];
};

export const buildBranchAppendMessage = (
  spec: BranchSpec,
  options: ExecuteBranchSpecOptions,
) => {
  const {
    contextArtifacts,
    contextNodeIds,
    contextScope,
    contextMessages,
    historyMode,
    modelId,
    provider,
    text,
  } = options;
  const trimmedText = text.trim();
  if (!trimmedText || (options.requireContextScope && !contextScope)) return null;

  const inputArtifactIds = uniqueIds(
    options.inputArtifactIds ?? contextArtifacts?.map((artifact) => artifact.id),
  );
  const outputArtifactIds = uniqueIds(options.outputArtifactIds);
  const formattingInstruction = getOutputFormatInstruction(
    options.outputArtifactTypes ?? [],
  );
  const promptText = `${trimmedText}${formattingInstruction}`;
  const liveContextMessages =
    contextScope === "tree" && contextMessages
      ? packFullTreeContextMessages(contextMessages)
      : contextMessages;
  const durableContextMessages =
    contextScope === "tree" && contextMessages
      ? boundDurableTreeContextMessages(contextMessages)
      : contextMessages;

  const baseScopedConfig = {
    ...(contextScope ? { contextScope } : {}),
    historyMode,
    model: modelId,
    provider,
  };
  const durableScopedConfig = {
    ...(durableContextMessages && durableContextMessages.length > 0
      ? { contextMessages: durableContextMessages }
      : {}),
    ...baseScopedConfig,
  };
  const scopedRequestConfig = {
    ...(contextArtifacts && contextArtifacts.length > 0
      ? { contextArtifacts }
      : {}),
    ...(liveContextMessages && liveContextMessages.length > 0
      ? { contextMessages: liveContextMessages }
      : {}),
    ...baseScopedConfig,
  };

  return {
    parentId: spec.parentId,
    sourceId: spec.sourceId,
    role: spec.targetRole,
    content: [{ type: "text" as const, text: promptText }],
    metadata: {
      custom: {
        branchAnchorId: spec.anchorId,
        branchAnchorRole: spec.anchorRole,
        branchOperation: spec.operation,
        ...durableScopedConfig,
        ...(contextNodeIds && contextNodeIds.length > 0
          ? { contextNodeIds: [...contextNodeIds] }
          : {}),
        ...(inputArtifactIds.length > 0 ? { inputArtifactIds } : {}),
        ...(outputArtifactIds.length > 0 ? { outputArtifactIds } : {}),
      },
    },
    runConfig: {
      custom: {
        ...scopedRequestConfig,
        ...(inputArtifactIds.length > 0 ? { inputArtifactIds } : {}),
        ...(outputArtifactIds.length > 0 ? { outputArtifactIds } : {}),
      },
    },
    startRun: spec.startRun,
  };
};

export const executeBranchSpec = (
  threadRuntime: ThreadRuntime,
  spec: BranchSpec,
  options: ExecuteBranchSpecOptions,
) => {
  const message = buildBranchAppendMessage(spec, options);
  if (!message) return false;

  // assistant-ui's public ThreadRuntime.append coerces `parentId: null` into the
  // current head message. For root-level branching we need to preserve `null`.
  const internalState = (threadRuntime as InternalThreadRuntime).__internal_threadBinding?.getState?.();
  const internalAppend =
    internalState && typeof internalState.append === "function"
      ? internalState.append.bind(internalState)
      : null;

  if (internalAppend) {
    internalAppend(message);
    return true;
  }

  threadRuntime.append(message);
  return true;
};
