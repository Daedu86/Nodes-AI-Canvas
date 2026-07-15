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
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";

type AssistantRuntime = NonNullable<ReturnType<typeof useAssistantRuntime>>;
type BranchSpec = ReturnType<typeof buildBranchSpec>;

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
};

export function buildCanvasContextMessages(
  nodes: ThreadGraphNodeModel[],
  parentId: string | null,
  scope: ContextScope,
  promptText: string,
) {
  type ScopedContextMessage = {
    id?: string;
    role: "user" | "assistant";
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
    history = message ? [message] : [];
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

  const handleCancelRun = React.useCallback(() => {
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
  }, [clearRequestError, runtime.threads.main, setRequestError]);

  const handleCancelPromptDraft = React.useCallback(() => {
    branchSubmissionLockRef.current = false;
    pendingDraftSubmissionRef.current = false;
    setIsSubmittingBranch(false);
    setCanvasDraftError(null);
    clearRequestError();
    cancelDraft();
  }, [cancelDraft, clearRequestError]);

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
    const activeDraft = { ...draft, contextScope: draft.contextScope };

    void (async () => {
      let submitted = false;
      try {
        setIsSubmittingBranch(true);
        setCanvasDraftError(null);
        clearRequestError();

        const threadReady = await ensureThreadIdle(runtime.threads.main);
        if (!threadReady) {
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          setCanvasDraftError(CANVAS_BRANCH_CANCEL_FAILURE);
          setRequestError(CANVAS_BRANCH_CANCEL_FAILURE);
          return;
        }
        if (!branchSubmissionLockRef.current) return;

        pendingDraftSubmissionRef.current = true;
        pendingOutputRunRef.current = {
          beforeNodeIds: new Set(canvasConversationNodesRef.current.map((node) => node.id)),
          sourcePromptId: CANVAS_PROMPT_DRAFT_NODE_ID,
          artifactIds: [...activeDraft.outputArtifactIds],
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
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          pendingOutputRunRef.current = null;
          const message = "Branch draft is empty. Add a prompt before creating the branch.";
          setCanvasDraftError(message);
          setRequestError(message);
          return;
        }
        submitted = true;
      } catch {
        branchSubmissionLockRef.current = false;
        pendingDraftSubmissionRef.current = false;
        pendingOutputRunRef.current = null;
        const message = "Canvas branching failed. Try again from the selected node.";
        setCanvasDraftError(message);
        setRequestError(message);
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
    setRequestError,
  ]);

  React.useEffect(() => {
    if (!requestError || !draft) return;
    setCanvasDraftError(requestError);
    if (branchSubmissionLockRef.current || pendingDraftSubmissionRef.current) {
      branchSubmissionLockRef.current = false;
      pendingDraftSubmissionRef.current = false;
      setIsSubmittingBranch(false);
    }
  }, [draft, requestError]);

  React.useEffect(() => {
    const unsubscribe = runtime.threads.main.unstable_on("runEnd", () => {
      const pendingOutput = pendingOutputRunRef.current;
      const resolveCompletedRun = (attempt: number) => {
        const currentNodes = canvasConversationNodesRef.current;
        const { promptNode, responseNode } = pendingOutput
          ? findCompletedCanvasRunNodes(currentNodes, pendingOutput.beforeNodeIds)
          : { promptNode: null, responseNode: null };

        if (pendingOutput && responseNode && promptNode) {
          applyCompletedResponse({
            promptId: promptNode.id,
            responseId: responseNode.id,
            sourcePromptId: pendingOutput.sourcePromptId,
            artifactIds: pendingOutput.artifactIds,
            text: responseNode.text,
          });
          pendingOutputRunRef.current = null;
        } else if (pendingOutput && attempt < 12) {
          window.setTimeout(() => resolveCompletedRun(attempt + 1), 75);
          return;
        } else {
          pendingOutputRunRef.current = null;
        }

        if (!pendingDraftSubmissionRef.current) return;
        if (requestErrorRef.current) {
          branchSubmissionLockRef.current = false;
          pendingDraftSubmissionRef.current = false;
          setIsSubmittingBranch(false);
          return;
        }
        branchSubmissionLockRef.current = false;
        pendingDraftSubmissionRef.current = false;
        setCanvasDraftError(null);
        cancelDraft();
        setIsSubmittingBranch(false);
      };
      window.setTimeout(() => resolveCompletedRun(0), 0);
    });
    return unsubscribe;
  }, [applyCompletedResponse, cancelDraft, runtime.threads.main]);

  return {
    canvasDraftError,
    handleCancelPromptDraft,
    handleCancelRun,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    setCanvasDraftError,
  };
}
