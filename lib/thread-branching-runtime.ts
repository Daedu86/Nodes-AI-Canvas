import type { ThreadRuntime } from "@assistant-ui/react";
import type { HistoryMode, ModelProvider } from "@/components/context/session-ui-state";
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
  modelId: string;
  provider: ModelProvider;
  text: string;
};

const uniqueIds = (value: string[] | undefined) =>
  value ? Array.from(new Set(value.filter(Boolean))) : [];

export const buildBranchAppendMessage = (
  spec: BranchSpec,
  options: ExecuteBranchSpecOptions,
) => {
  const {
    contextArtifacts,
    contextNodeIds,
    historyMode,
    modelId,
    provider,
    text,
  } = options;
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const inputArtifactIds = uniqueIds(
    options.inputArtifactIds ?? contextArtifacts?.map((artifact) => artifact.id),
  );
  const outputArtifactIds = uniqueIds(options.outputArtifactIds);
  const formattingInstruction = getOutputFormatInstruction(
    options.outputArtifactTypes ?? [],
  );
  const promptText = `${trimmedText}${formattingInstruction}`;

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
        ...(contextNodeIds && contextNodeIds.length > 0
          ? { contextNodeIds: [...contextNodeIds] }
          : {}),
        ...(inputArtifactIds.length > 0 ? { inputArtifactIds } : {}),
        ...(outputArtifactIds.length > 0 ? { outputArtifactIds } : {}),
      },
    },
    runConfig: {
      custom: {
        ...(contextArtifacts && contextArtifacts.length > 0
          ? { contextArtifacts }
          : {}),
        ...(inputArtifactIds.length > 0 ? { inputArtifactIds } : {}),
        ...(outputArtifactIds.length > 0 ? { outputArtifactIds } : {}),
        historyMode,
        model: modelId,
        provider,
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
