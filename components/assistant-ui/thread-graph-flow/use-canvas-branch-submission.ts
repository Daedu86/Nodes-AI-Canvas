"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import React from "react";
import type { ContextScope, GraphBranchIntent } from "@/components/context/graph-branch-intent";
import type { ModelProvider } from "@/components/context/model-config";
import {
  CANVAS_BRANCH_CANCEL_FAILURE,
  CANVAS_PROMPT_DRAFT_NODE_ID,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import { buildBranchSpec } from "@/lib/thread-branching";
import { executeBranchSpec } from "@/lib/thread-branching-runtime";
import { ensureThreadIdle } from "@/lib/thread-run-control";
import { toLlmContextArtifacts, type SessionArtifact } from "@/lib/session-artifacts";
import {
  resumeSessionPersist,
  suspendSessionPersist,
  type SessionPersistSuspensionToken,
} from "@/lib/session-persist-sync";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";

type AssistantRuntime = NonNullable<ReturnType<typeof useAssistantRuntime>>;
type BranchSpec = ReturnType<typeof buildBranchSpec>;
type ThreadExport = ReturnType<AssistantRuntime["threads"]["main"]["export"]>;

type CompletedResponseInput = {
  promptId: string;
  responseId: string;
  sourcePromptId?: string | null;
  text: string;
  artifactIds?: string[];
};

type UseCanvasBranchSubmissionOptions = {
  applyCompletedResponse: (input: CompletedResponseInput) => unknown;
  artifactIndex: ReadonlyMap<string, SessionArtifact>;
  cancelDraft: () => void;
  canvasConversationNodes: ThreadGraphNodeModel[];
  clearRequestError: () => void;
  draft: GraphBranchIntent | null;
  draftBranchSpec: BranchSpec | null;
  draftContextArtifacts: SessionArtifact[];
  llmEnabled: boolean;
  modelId: string;
  provider: ModelProvider;
  requestError: string | null;
  runtime: AssistantRuntime;
  setRequestError: (value: string | null) => void;
};

type PendingOutputRun = {
  beforeNodeIds: Set<string>;
  sourcePromptId: string;
  artifactIds: string[];
  preSubmitSnapshot: ThreadExport;
  persistSuspensionToken: SessionPersistSuspensionToken;
  submissionToken: number;
};

const ASSISTANT_FIRST_PARENT_CONTEXT =
  "Continue from the saved assistant response below; treat it as conversation context.";

export function buildCanvasContextMessages(
  nodes: ThreadGraphNodeModel[],
  parentId: string | null,
  scope: ContextScope,
  promptText: string,
) {
  type ScopedContextMessage = {
    id?: string;
    role: "user" | "assistant" | "system";
    content: string;
  };
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const toMessage = (node: ThreadGraphNodeModel | undefined): ScopedContextMessage | null =>
    node && (node.role === "user" || node.role === "assistant")
      ? { id: node.id, role: node.role as "user" | "assistant", content: node.text }
      : null;
  let history: ScopedContextMessage[] = [];

  if (scope === "parent") {
    const message = parentId ? toMessage(byId.get(parentId)) : null;
    history = message
      ? message.role === "assistant"
        ? [
            { role: "user", content: ASSISTANT_FIRST_PARENT_CONTEXT },
            message,
          ]
        : [message]
      : [];
  } else if (scope === "branch") {
    const lineage: ThreadGraphNodeModel[] = [];
    const visited = new Set<string>();
    let current = parentId ? byId.get(parentId) : undefined;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    history = lineage.reverse().flatMap((node) => {
      const message = toMessage(node);
      return message ? [message] : [];
    });
  } else {
    history = [...nodes]
      .sort((a, b) => a.idx - b.idx || a.id.localeCompare(b.id))
      .flatMap((node) => {
        const message = toMessage(node);
        return message ? [message] : [];
      });
  }

  return [
    ...history,
    { role: "user" as const, content: promptText.trim() },
  ].filter((message) => message.content.length > 0);
}

export function findCompletedCanvasRunNodes(
  currentNodes: ThreadGraphNodeModel[],
  beforeNodeIds: ReadonlySet<string>,
) {
  const newNodes = currentNodes.filter((node) => !beforeNodeIds.has(node.id));
  const responseNode = [...newNodes]
    .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))
    .find((node) => node.role === "assistant");
  const promptNode = responseNode?.parentId
    ? currentNodes.find((node) => node.id === responseNode.parentId) ?? null
    : [...newNodes]
        .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))
        .find((node) => node.role === "user") ?? null;

  return { promptNode, responseNode: responseNode ?? null };
}

export function isCompletedRuntimeResponse(snapshot: unknown, responseId: string) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const messages = (snapshot as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return false;
  const entry = messages.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const message = (candidate as { message?: unknown }).message;
    return (
      !!message &&
      typeof message === "object" &&
      (message as { id?: unknown }).id === responseId
    );
  });
  if (!entry || typeof entry !== "object") return false;
  const message = (entry as { message?: unknown }).message;
  if (!message || typeof message !== "object") return false;
  const status = (message as { status?: unknown }).status;
  return (
    !!status &&
    typeof status === "object" &&
    (status as { type?: unknown }).type === "complete"
  );
}

export function useCanvasBranchSubmission({
  applyCompletedResponse,
  artifactIndex,
  cancelDraft,
  canvasConversationNodes,
  clearRequestError,
  draft,
  draftBranchSpec,
  draftContextArtifacts,
  llmEnabled,
  modelId,
  provider,
  requestError,
  runtime,
  setRequestError,
}: UseCanvasBranchSubmissionOptions) {
  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);
  const [canvasDraftError, setCanvasDraftError] = React.useState<string | null>(null);
  const branchSubmissionLockRef = React.useRef(false);
  const pendingDraftSubmissionRef = React.useRef(false);
  const pendingOutputRunRef = React.useRef<PendingOutputRun | null>(null);
  const resolveCompletedRunTimerRef = React.useRef<number | null>(null);
  const submissionTokenRef = React.useRef(0);
  const canvasConversationNodesRef = React.useRef<ThreadGraphNodeModel[]>(
    canvasConversationNodes,
  );
  const requestErrorRef = React.useRef<string | null>(requestError);

  React.useEffect(() => {
    canvasConversationNodesRef.current = canvasConversationNodes;
  }, [canvasConversationNodes]);

  React.useEffect(() => {
    requestErrorRef.current = requestError;
  }, [requestError]);

  const clearResolveCompletedRunTimer = React.useCallback(() => {
    if (resolveCompletedRunTimerRef.current === null) return;
    window.clearTimeout(resolveCompletedRunTimerRef.current);
    resolveCompletedRunTimerRef.current = null;
  }, []);

  const rollbackPendingTransaction = React.useCallback(
    (expectedSubmissionToken: number, message: string | null) => {
      const pending = pendingOutputRunRef.current;
      if (
        !pending ||
        pending.submissionToken !== expectedSubmissionToken ||
        submissionTokenRef.current !== expectedSubmissionToken
      ) {
        return false;
      }

      // Detach the transaction before cancelRun/import because either operation
      // may synchronously emit runEnd or repository subscription callbacks.
      pendingOutputRunRef.current = null;
      pendingDraftSubmissionRef.current = false;
      clearResolveCompletedRunTimer();
      try {
        runtime.threads.main.cancelRun();
      } catch {
        // The provider may already have ended the failed run.
      }

      let restored = false;
      try {
        runtime.threads.main.import(pending.preSubmitSnapshot);
        restored = true;
      } catch {
        // Keep the original provider error when available, while making a failed
        // rollback explicit so the user knows a reload may be necessary.
        message = message
          ? `${message} The provisional branch could not be rolled back; reload before retrying.`
          : "The provisional branch could not be rolled back; reload before retrying.";
      } finally {
        // The runtime is now either restored or explicitly failed. Only this
        // transaction's opaque persistence token can resume saving.
        resumeSessionPersist(pending.persistSuspensionToken);
      }

      branchSubmissionLockRef.current = false;
      setIsSubmittingBranch(false);
      if (message) {
        requestErrorRef.current = message;
        setCanvasDraftError(message);
        setRequestError(message);
      }
      return restored;
    },
    [clearResolveCompletedRunTimer, runtime.threads.main, setRequestError],
  );

  const handleCancelRun = React.useCallback(() => {
    const pending = pendingOutputRunRef.current;
    if (pending) {
      rollbackPendingTransaction(pending.submissionToken, null);
      requestErrorRef.current = null;
      clearRequestError();
      setCanvasDraftError(null);
      return;
    }
    submissionTokenRef.current += 1;
    clearRequestError();
    setCanvasDraftError(null);
    branchSubmissionLockRef.current = false;
    pendingDraftSubmissionRef.current = false;
    setIsSubmittingBranch(false);
    try {
      runtime.threads.main.cancelRun();
    } catch {
      const message = "Unable to cancel the current run.";
      setCanvasDraftError(message);
      setRequestError(message);
    }
  }, [clearRequestError, rollbackPendingTransaction, runtime.threads.main, setRequestError]);

  const handleCancelPromptDraft = React.useCallback(() => {
    const pending = pendingOutputRunRef.current;
    if (pending) {
      rollbackPendingTransaction(pending.submissionToken, null);
    } else {
      submissionTokenRef.current += 1;
    }
    branchSubmissionLockRef.current = false;
    pendingDraftSubmissionRef.current = false;
    setIsSubmittingBranch(false);
    setCanvasDraftError(null);
    clearRequestError();
    cancelDraft();
  }, [cancelDraft, clearRequestError, rollbackPendingTransaction]);

  const handleSubmitBranchDraft = React.useCallback(() => {
    if (!draftBranchSpec || !draft || !llmEnabled) return;
    if (!draft.contextScope) {
      const message = "Choose Parent, Branch, or Tree context before running this draft.";
      setCanvasDraftError(message);
      setRequestError(message);
      return;
    }
    if (branchSubmissionLockRef.current) return;
    branchSubmissionLockRef.current = true;
    const submissionToken = submissionTokenRef.current + 1;
    submissionTokenRef.current = submissionToken;
    const activeDraft = { ...draft, contextScope: draft.contextScope };

    void (async () => {
      let submitted = false;
      try {
        setIsSubmittingBranch(true);
        setCanvasDraftError(null);
        requestErrorRef.current = null;
        clearRequestError();

        const threadReady = await ensureThreadIdle(runtime.threads.main);
        if (!threadReady) {
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          setCanvasDraftError(CANVAS_BRANCH_CANCEL_FAILURE);
          setRequestError(CANVAS_BRANCH_CANCEL_FAILURE);
          return;
        }
        if (
          !branchSubmissionLockRef.current ||
          submissionTokenRef.current !== submissionToken
        ) {
          return;
        }

        const persistSuspensionToken = suspendSessionPersist();
        let preSubmitSnapshot: ThreadExport;
        try {
          const exportedSnapshot = runtime.threads.main.export();
          preSubmitSnapshot =
            typeof structuredClone === "function"
              ? structuredClone(exportedSnapshot)
              : exportedSnapshot;
        } catch {
          resumeSessionPersist(persistSuspensionToken);
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          const message = "Canvas branching could not capture the current conversation. Try again.";
          setCanvasDraftError(message);
          setRequestError(message);
          return;
        }
        pendingDraftSubmissionRef.current = true;
        pendingOutputRunRef.current = {
          beforeNodeIds: new Set(canvasConversationNodesRef.current.map((node) => node.id)),
          sourcePromptId: CANVAS_PROMPT_DRAFT_NODE_ID,
          artifactIds: [...activeDraft.outputArtifactIds],
          preSubmitSnapshot,
          persistSuspensionToken,
          submissionToken,
        };
        const executed = executeBranchSpec(runtime.threads.main, draftBranchSpec, {
          contextScope: activeDraft.contextScope,
          contextMessages: buildCanvasContextMessages(
            canvasConversationNodesRef.current,
            draftBranchSpec.parentId,
            activeDraft.contextScope,
            activeDraft.text,
          ),
          contextArtifacts:
            draftContextArtifacts.length > 0
              ? toLlmContextArtifacts(draftContextArtifacts)
              : undefined,
          contextNodeIds:
            draftContextArtifacts.length > 0
              ? draftContextArtifacts.map((artifact) => artifact.id)
              : undefined,
          historyMode: activeDraft.contextScope === "parent" ? "last" : "full",
          inputArtifactIds: activeDraft.inputArtifactIds,
          modelId,
          outputArtifactIds: activeDraft.outputArtifactIds,
          outputArtifactTypes: activeDraft.outputArtifactIds.map(
            (artifactId) => artifactIndex.get(artifactId)?.semanticType ?? null,
          ),
          provider,
          requireContextScope: true,
          text: activeDraft.text,
        });
        if (!executed) {
          const message = "Branch draft is empty. Add a prompt before creating the branch.";
          rollbackPendingTransaction(submissionToken, message);
          return;
        }
        submitted = true;
      } catch {
        const message = "Canvas branching failed. Try again from the selected node.";
        if (!rollbackPendingTransaction(submissionToken, message)) {
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          pendingOutputRunRef.current = null;
          setCanvasDraftError(message);
          setRequestError(message);
        }
      } finally {
        if (!submitted) {
          setIsSubmittingBranch(false);
        }
      }
    })();
  }, [
    artifactIndex,
    clearRequestError,
    draft,
    draftBranchSpec,
    draftContextArtifacts,
    llmEnabled,
    modelId,
    provider,
    runtime.threads.main,
    rollbackPendingTransaction,
    setRequestError,
  ]);

  React.useEffect(() => {
    if (!requestError) return;
    const pending = pendingOutputRunRef.current;
    if (pending) {
      rollbackPendingTransaction(pending.submissionToken, requestError);
      return;
    }
    if (draft) setCanvasDraftError(requestError);
  }, [draft, requestError, rollbackPendingTransaction]);

  React.useEffect(() => {
    const unsubscribe = runtime.threads.main.unstable_on("runEnd", () => {
      const pendingOutput = pendingOutputRunRef.current;
      if (!pendingOutput) return;
      const expectedSubmissionToken = pendingOutput.submissionToken;
      const resolveCompletedRun = (attempt: number) => {
        const activePending = pendingOutputRunRef.current;
        if (
          !activePending ||
          activePending.submissionToken !== expectedSubmissionToken ||
          submissionTokenRef.current !== expectedSubmissionToken
        ) {
          return;
        }
        const currentNodes = canvasConversationNodesRef.current;
        const { promptNode, responseNode } = pendingOutput
          ? findCompletedCanvasRunNodes(currentNodes, pendingOutput.beforeNodeIds)
          : { promptNode: null, responseNode: null };

        let responseIsComplete = false;
        if (responseNode) {
          try {
            responseIsComplete = isCompletedRuntimeResponse(
              runtime.threads.main.export(),
              responseNode.id,
            );
          } catch {
            // Repository export can lag the rendered graph by a render frame.
          }
        }

        if (pendingOutput && responseNode && promptNode && responseIsComplete) {
          try {
            applyCompletedResponse({
              promptId: promptNode.id,
              responseId: responseNode.id,
              sourcePromptId: pendingOutput.sourcePromptId,
              artifactIds: pendingOutput.artifactIds,
              text: responseNode.text,
            });
          } catch {
            rollbackPendingTransaction(
              expectedSubmissionToken,
              "The assistant response could not be committed. Your draft was kept so you can try again.",
            );
            return;
          }
          pendingOutputRunRef.current = null;
          pendingDraftSubmissionRef.current = false;
          clearResolveCompletedRunTimer();
          resumeSessionPersist(pendingOutput.persistSuspensionToken);
          branchSubmissionLockRef.current = false;
          setCanvasDraftError(null);
          cancelDraft();
          setIsSubmittingBranch(false);
        } else if (pendingOutput && attempt < 12) {
          resolveCompletedRunTimerRef.current = window.setTimeout(
            () => resolveCompletedRun(attempt + 1),
            75,
          );
          return;
        } else {
          rollbackPendingTransaction(
            expectedSubmissionToken,
            requestErrorRef.current ??
              "The assistant did not return a response. Your draft was kept so you can try again.",
          );
        }
      };
      resolveCompletedRunTimerRef.current = window.setTimeout(
        () => resolveCompletedRun(0),
        0,
      );
    });
    return unsubscribe;
  }, [
    applyCompletedResponse,
    cancelDraft,
    clearResolveCompletedRunTimer,
    rollbackPendingTransaction,
    runtime.threads.main,
  ]);

  React.useEffect(
    () => () => {
      clearResolveCompletedRunTimer();
      const pending = pendingOutputRunRef.current;
      if (!pending) return;
      pendingOutputRunRef.current = null;
      pendingDraftSubmissionRef.current = false;
      submissionTokenRef.current += 1;
      try {
        runtime.threads.main.cancelRun();
      } catch {
        // The run may already have ended while the Canvas was unmounting.
      }
      try {
        runtime.threads.main.import(pending.preSubmitSnapshot);
      } catch {
        // Cleanup must still release the module-level persistence suspension.
      } finally {
        resumeSessionPersist(pending.persistSuspensionToken);
      }
    },
    [clearResolveCompletedRunTimer, runtime.threads.main],
  );

  return {
    canvasDraftError,
    handleCancelPromptDraft,
    handleCancelRun,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    setCanvasDraftError,
  };
}
