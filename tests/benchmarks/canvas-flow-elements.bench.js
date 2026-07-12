import { bench, describe } from "vitest";
import { ROOT_NODE_ID } from "../../components/assistant-ui/thread-graph/graph-types";
import { buildCanvasFlowElements } from "../../components/assistant-ui/thread-graph-flow/canvas-flow-elements";

const timestamp = "2026-07-12T14:00:00.000Z";

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

const createBenchmarkParams = () => {
  const canvasConversationNodes = Array.from({ length: 1_000 }, (_, index) => {
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
    const branch = Math.floor(index / 100);
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
      editedFromId: index % 100 === 0 ? `old-${index}` : null,
      isBridge: index % 250 === 0,
    };
  });

  const artifacts = Array.from({ length: 250 }, (_, index) =>
    createArtifact(`artifact-${index}`, index % 5 === 0 ? "code" : "text"),
  );
  const canvasPrompts = Array.from({ length: 50 }, (_, index) =>
    createArtifact(`prompt-${index}`, "prompt"),
  );
  const allArtifacts = [...artifacts, ...canvasPrompts];
  const canvasLinks = [];

  for (let index = 0; index < 1_000; index += 1) {
    const promptId =
      index % 2 === 0
        ? `message-${1 + (index % 999)}`
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

  for (let index = 0; index < 1_000; index += 1) {
    const fromPrompt = index % 2 === 0;
    canvasLinks.push({
      id: `output-${index}`,
      relation: "output",
      artifactId: `artifact-${index % artifacts.length}`,
      promptId: fromPrompt ? `prompt-${index % canvasPrompts.length}` : null,
      responseId: fromPrompt ? null : `message-${1 + (index % 999)}`,
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
    artifacts,
    artifactIndex: new Map(allArtifacts.map((artifact) => [artifact.id, artifact])),
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
    nodeIndex: new Map(canvasConversationNodes.map((node) => [node.id, node])),
    overrides: new Set(
      canvasConversationNodes
        .filter((_, index) => index % 50 === 0)
        .map((node) => node.id),
    ),
    promptIndex: new Map(canvasPrompts.map((prompt) => [prompt.id, prompt])),
    requestError: null,
    runCanvasPrompt: noOp,
    setDraftText: noOp,
    updateArtifact: noOp,
  };
};

const params = createBenchmarkParams();

describe("canvas flow builder", () => {
  bench(
    "1,000 messages, 300 artifacts/prompts, and 2,000 links",
    () => {
      const result = buildCanvasFlowElements(params);
      if (
        result.nodes.length !== 1_300 ||
        result.conversationEdges.length !== 999 ||
        result.edges.length !== 2_999
      ) {
        throw new Error("Unexpected benchmark graph shape");
      }
    },
    {
      iterations: 5,
      warmupIterations: 1,
    },
  );
});
