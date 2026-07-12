import { describe, expect, it, vi } from "vitest";
import { ROOT_NODE_ID } from "../components/assistant-ui/thread-graph/graph-types";
import {
  buildCanvasFlowElements,
  type CanvasFlowElementsParams,
} from "../components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import { buildCanvasFlowIndexes } from "../components/assistant-ui/thread-graph-flow/canvas-flow-indexes";
import type {
  SessionArtifact,
  SessionCanvasLink,
} from "../lib/session-artifacts";

const timestamp = "2026-07-12T14:00:00.000Z";

const createArtifact = (
  id: string,
  artifactType: SessionArtifact["artifactType"] = "text",
): SessionArtifact => ({
  id,
  title: id,
  artifactType,
  content: `${id} content`,
  position: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...(artifactType === "prompt" ? { promptStatus: "idle" as const } : {}),
});

const createParams = () => {
  const canvasConversationNodes = [
    {
      id: ROOT_NODE_ID,
      parentId: null,
      role: "system",
      text: "Conversation root",
      depth: 0,
      idx: 0,
      branchId: "main",
    },
    {
      id: "message-1",
      parentId: ROOT_NODE_ID,
      role: "user",
      text: "First prompt",
      depth: 1,
      idx: 1,
      branchId: "main",
      provider: "openrouter",
      model: "openrouter/free",
    },
    {
      id: "message-2",
      parentId: "message-1",
      role: "assistant",
      text: "First response",
      depth: 2,
      idx: 2,
      branchId: "main",
      editedFromId: "message-old",
      provider: "openrouter",
      model: "openrouter/free",
    },
  ];
  const artifacts = [
    createArtifact("artifact-1"),
    createArtifact("artifact-2", "code"),
  ];
  const canvasPrompts = [createArtifact("prompt-1", "prompt")];
  const canvasLinks: SessionCanvasLink[] = [
    {
      id: "context-1",
      relation: "context",
      artifactId: "artifact-1",
      promptId: "message-1",
      responseId: null,
      targetMessageId: "message-1",
      createdAt: timestamp,
    },
    {
      id: "context-2",
      relation: "context",
      artifactId: "artifact-2",
      promptId: "prompt-1",
      responseId: null,
      targetMessageId: "prompt-1",
      createdAt: timestamp,
    },
    {
      id: "output-1",
      relation: "output",
      artifactId: "artifact-1",
      promptId: "prompt-1",
      responseId: null,
      targetMessageId: null,
      createdAt: timestamp,
    },
    {
      id: "output-2",
      relation: "output",
      artifactId: "artifact-2",
      promptId: null,
      responseId: "message-2",
      targetMessageId: null,
      createdAt: timestamp,
    },
  ];
  const contextLinks = canvasLinks.flatMap((link) =>
    link.relation === "context" && link.promptId
      ? [
          {
            ...link,
            relation: "context" as const,
            promptId: link.promptId,
            targetMessageId: link.promptId,
          },
        ]
      : [],
  );
  const allArtifacts = [...artifacts, ...canvasPrompts];
  const updateArtifact = vi.fn();
  const handleCutEdge = vi.fn();

  const params: CanvasFlowElementsParams = {
    artifacts,
    artifactIndex: new Map(allArtifacts.map((artifact) => [artifact.id, artifact])),
    canvasConversationNodes,
    canvasLinks,
    canvasPrompts,
    cancelCanvasPrompt: vi.fn() as CanvasFlowElementsParams["cancelCanvasPrompt"],
    canvasDraftError: null,
    contextLinks,
    deleteArtifact: vi.fn(),
    draft: null,
    draftAnchorNode: null,
    draftBranchSpec: null,
    draftContextCount: 0,
    draftDetail: null,
    getArtifactsForTarget: vi.fn(() => []) as CanvasFlowElementsParams["getArtifactsForTarget"],
    handleCancelPromptDraft: vi.fn(),
    handleCancelRun: vi.fn(),
    handleCutEdge,
    handleSubmitBranchDraft: vi.fn(),
    isSubmittingBranch: false,
    isThreadRunning: false,
    linkedTargetCountByArtifact: new Map([
      ["artifact-1", 1],
      ["artifact-2", 1],
    ]),
    linkEditMode: true,
    llmEnabled: true,
    nodeIndex: new Map(canvasConversationNodes.map((node) => [node.id, node])),
    overrides: new Set(["message-2"]),
    promptIndex: new Map(canvasPrompts.map((prompt) => [prompt.id, prompt])),
    requestError: null,
    runCanvasPrompt: vi.fn() as CanvasFlowElementsParams["runCanvasPrompt"],
    setDraftText: vi.fn(),
    updateArtifact: updateArtifact as CanvasFlowElementsParams["updateArtifact"],
  };

  return { handleCutEdge, params, updateArtifact };
};

describe("canvas flow elements", () => {
  it("builds the same semantic nodes and edges with indexed link counts", () => {
    const { handleCutEdge, params, updateArtifact } = createParams();
    const result = buildCanvasFlowElements(params);

    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(6);
    expect(result.conversationEdges).toHaveLength(2);

    const messageNode = result.nodes.find((node) => node.id === "message-1");
    const cutNode = result.nodes.find((node) => node.id === "message-2");
    const promptNode = result.nodes.find((node) => node.id === "prompt-1");
    expect(messageNode?.data.linkedArtifactCount).toBe(1);
    expect(cutNode?.data.isCut).toBe(true);
    expect(promptNode?.data).toMatchObject({
      draftContextCount: 1,
      draftOutputCount: 1,
      kind: "canvas-prompt",
    });

    expect(result.edges.map((edge) => [edge.id, edge.data?.tone])).toEqual(
      expect.arrayContaining([
        ["context:artifact-1->message-1", "context"],
        ["context:artifact-2->prompt-1", "context"],
        ["output:prompt-1->artifact-1", "pending-output"],
        ["output:message-2->artifact-2", "output"],
      ]),
    );

    const editableEdge = result.conversationEdges.find(
      (edge) => edge.target === "message-2",
    );
    editableEdge?.data?.onCut?.();
    expect(handleCutEdge).toHaveBeenCalledWith("message-2", "message-1");

    promptNode?.data.onDraftTextChange?.("Updated prompt");
    expect(updateArtifact).toHaveBeenCalledWith(
      "prompt-1",
      { content: "Updated prompt" },
      { revisionOrigin: "manual", revisionAuthor: "user" },
    );
  });

  it("counts unique existing artifacts and all prompt links in one pass", () => {
    const artifact = createArtifact("artifact-1");
    const links: SessionCanvasLink[] = [
      {
        id: "1",
        relation: "context",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "2",
        relation: "context",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "3",
        relation: "context",
        artifactId: "missing-artifact",
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "4",
        relation: "output",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
    ];

    const indexes = buildCanvasFlowIndexes(
      links,
      new Map([[artifact.id, artifact]]),
    );
    expect(indexes.linkedArtifactCountByTarget.get("prompt-1")).toBe(1);
    expect(indexes.promptLinkCountById.get("prompt-1")).toEqual({
      context: 3,
      output: 1,
    });
  });
});
