import type { ThreadRuntime } from "@assistant-ui/react";
import type { HistoryMode } from "@/components/context/session-ui-state";
import type { ModelProvider } from "@/components/context/session-ui-state";
import type { BranchSpec } from "@/lib/thread-branching";
import type { LlmContextArtifact } from "@/lib/session-artifacts";

type InternalThreadRuntime = ThreadRuntime & {
  __internal_threadBinding?: {
    getState?: () => {
      append?: (message: ReturnType<typeof buildBranchAppendMessage>) => void;
    };
  };
};

type ExecuteBranchSpecOptions = {
  contextArtifacts?: LlmContextArtifact[];
  contextNodeIds?: string[];
  historyMode: HistoryMode;
  modelId: string;
  provider: ModelProvider;
  text: string;
};

export const buildBranchAppendMessage = (
  spec: BranchSpec,
  options: ExecuteBranchSpecOptions,
) => {
  const { contextArtifacts, contextNodeIds, historyMode, modelId, provider, text } = options;
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  return {
    parentId: spec.parentId,
    sourceId: spec.sourceId,
    role: spec.targetRole,
    content: [{ type: "text" as const, text: trimmedText }],
    metadata: {
      custom: {
        branchAnchorId: spec.anchorId,
        branchAnchorRole: spec.anchorRole,
        branchOperation: spec.operation,
        ...(contextNodeIds && contextNodeIds.length > 0
          ? { contextNodeIds: [...contextNodeIds] }
          : {}),
      },
    },
    runConfig: {
      custom: {
        ...(contextArtifacts && contextArtifacts.length > 0
          ? { contextArtifacts }
          : {}),
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
  // current head message. For root-level branching we need to preserve `null`
  // exactly, so we call the underlying core append when available.
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
