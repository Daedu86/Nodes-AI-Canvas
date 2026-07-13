import { ROOT_NODE_ID } from "../../components/assistant-ui/thread-graph/graph-types";

const timestamp = "2026-07-12T14:00:00.000Z";

export const DEFAULT_CANVAS_BENCHMARK_WORKLOAD = Object.freeze({
  artifactCount: 250,
  contextLinkCount: 1_000,
  messageCount: 1_000,
  outputLinkCount: 1_000,
  promptCount: 50,
});

const positiveInteger = (value, fallback, minimum = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum
    ? Math.floor(parsed)
    : fallback;
};

const normalizeWorkload = (input = {}) => ({
  artifactCount: positiveInteger(
    input.artifactCount,
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.artifactCount,
  ),
  contextLinkCount: positiveInteger(
    input.contextLinkCount,
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.contextLinkCount,
  ),
  messageCount: positiveInteger(
    input.messageCount,
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.messageCount,
    2,
  ),
  outputLinkCount: positiveInteger(
    input.outputLinkCount,
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.outputLinkCount,
  ),
  promptCount: positiveInteger(
    input.promptCount,
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.promptCount,
  ),
});

const createArtifact = (id, artifactType) => ({
  id,
  title: id,
  artifactType,
  content: `${id} benchmark content`,
  position: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...(artifactType === "prompt" ? { promptStatus: "idle" } : {}),
});

export const createCanvasBenchmarkCase = (input = {}) => {
  const workload = normalizeWorkload(input);
  const branchSize = Math.max(1, Math.floor(workload.messageCount / 10));
  const canvasConversationNodes = Array.from(
    { length: workload.messageCount },
    (_, index) => {
      if (index === 0) {
        return {
          id: ROOT_NODE_ID,
          parentId: null,
          role: "system",
          text: "Conversation root",
          depth: 0,
          idx: 0,
          branchId: "root",
          provider: null,
          model: null,
        };
      }
      const branch = Math.floor(index / branchSize);
      return {
        id: `message-${index}`,
        parentId: index === 1 ? ROOT_NODE_ID : `message-${index - 1}`,
        role: index % 2 === 0 ? "assistant" : "user",
        text: `Benchmark message ${index}`,
        depth: index,
        idx: index,
        branchId: `branch-${branch}`,
        provider: "openrouter",
        model: index % 3 === 0 ? "openrouter/free" : "nvidia/nemotron",
        editedFromId: index % branchSize === 0 ? `old-${index}` : null,
        isBridge: index % Math.max(1, Math.floor(workload.messageCount / 4)) === 0,
      };
    },
  );

  const artifacts = Array.from({ length: workload.artifactCount }, (_, index) =>
    createArtifact(`artifact-${index}`, index % 5 === 0 ? "code" : "text"),
  );
  const canvasPrompts = Array.from({ length: workload.promptCount }, (_, index) =>
    createArtifact(`prompt-${index}`, "prompt"),
  );
  const allArtifacts = [...artifacts, ...canvasPrompts];
  const canvasLinks = [];
  const messageTargetCount = workload.messageCount - 1;

  for (let index = 0; index < workload.contextLinkCount; index += 1) {
    const promptId =
      index % 2 === 0
        ? `message-${1 + (index % messageTargetCount)}`
        : `prompt-${index % canvasPrompts.length}`;
    canvasLinks.push({
      id: `context-${index}`,
      relation: "context",
      artifactId: `artifact-${index % artifacts.length}`,
      promptId,
      responseId: null,
      targetMessageId: promptId,
      createdAt: timestamp,
    });
  }

  for (let index = 0; index < workload.outputLinkCount; index += 1) {
    const fromPrompt = index % 2 === 0;
    canvasLinks.push({
      id: `output-${index}`,
      relation: "output",
      artifactId: `artifact-${index % artifacts.length}`,
      promptId: fromPrompt ? `prompt-${index % canvasPrompts.length}` : null,
      responseId: fromPrompt
        ? null
        : `message-${1 + (index % messageTargetCount)}`,
      targetMessageId: null,
      createdAt: timestamp,
    });
  }

  const contextLinks = canvasLinks.flatMap((link) =>
    link.relation === "context" && link.promptId
      ? [
          {
            ...link,
            relation: "context",
            promptId: link.promptId,
            targetMessageId: link.promptId,
          },
        ]
      : [],
  );
  const linkedTargetCountByArtifact = new Map();
  for (const link of contextLinks) {
    linkedTargetCountByArtifact.set(
      link.artifactId,
      (linkedTargetCountByArtifact.get(link.artifactId) ?? 0) + 1,
    );
  }

  const noOp = () => {};
  return {
    expected: {
      conversationEdges: workload.messageCount - 1,
      edges:
        workload.messageCount - 1 +
        workload.contextLinkCount +
        workload.outputLinkCount,
      nodes:
        workload.messageCount + workload.artifactCount + workload.promptCount,
    },
    params: {
      artifacts,
      artifactIndex: new Map(
        allArtifacts.map((artifact) => [artifact.id, artifact]),
      ),
      canvasConversationNodes,
      canvasLinks,
      canvasPrompts,
      cancelCanvasPrompt: noOp,
      canvasDraftError: null,
      contextLinks,
      deleteArtifact: noOp,
      draft: null,
      draftAnchorNode: null,
      draftBranchSpec: null,
      draftContextCount: 0,
      draftDetail: null,
      getArtifactsForTarget: () => [],
      handleCancelPromptDraft: noOp,
      handleCancelRun: noOp,
      handleCutEdge: noOp,
      handleSubmitBranchDraft: noOp,
      isSubmittingBranch: false,
      isThreadRunning: false,
      linkedTargetCountByArtifact,
      linkEditMode: false,
      llmEnabled: true,
      nodeIndex: new Map(
        canvasConversationNodes.map((node) => [node.id, node]),
      ),
      overrides: new Set(
        canvasConversationNodes
          .filter((_, index) => index % 50 === 0)
          .map((node) => node.id),
      ),
      promptIndex: new Map(
        canvasPrompts.map((prompt) => [prompt.id, prompt]),
      ),
      requestError: null,
      runCanvasPrompt: noOp,
      setDraftText: noOp,
      updateArtifact: noOp,
    },
    workload,
  };
};

export const assertCanvasBenchmarkShape = (result, expected) => {
  if (
    result.nodes.length !== expected.nodes ||
    result.conversationEdges.length !== expected.conversationEdges ||
    result.edges.length !== expected.edges
  ) {
    throw new Error(
      `Unexpected benchmark graph shape: expected ${JSON.stringify(expected)}, received ${JSON.stringify({
        conversationEdges: result.conversationEdges.length,
        edges: result.edges.length,
        nodes: result.nodes.length,
      })}`,
    );
  }
};
