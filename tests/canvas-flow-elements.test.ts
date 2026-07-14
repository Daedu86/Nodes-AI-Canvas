// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { buildCanvasFlowElements } from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import {
  CANVAS_PROMPT_DRAFT_NODE_ID,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import {
  ROOT_NODE_ID,
  type Node as ThreadGraphNodeModel,
} from "@/components/assistant-ui/thread-graph/graph-types";
import type { SessionArtifact, SessionCanvasLink } from "@/lib/session-artifacts";

const timestamp = "2026-07-11T00:00:00.000Z";

const artifact = (
  input: Partial<SessionArtifact> & Pick<SessionArtifact, "id" | "artifactType">,
): SessionArtifact => ({
  title: input.title ?? input.id,
  content: input.content ?? "",
  createdAt: input.createdAt ?? timestamp,
  updatedAt: input.updatedAt ?? timestamp,
  ...input,
});

const conversationNodes: ThreadGraphNodeModel[] = [
  {
    id: ROOT_NODE_ID,
    parentId: null,
    role: "ROOT",
    text: "Conversation Root",
    depth: 0,
    idx: -1,
    branchId: null,
    isBridge: false,
    model: null,
    provider: null,
  },
  {
    id: "user-1",
    parentId: ROOT_NODE_ID,
    role: "user",
    text: "Question",
    depth: 1,
    idx: 0,
    branchId: "branch-1",
    isBridge: false,
    model: "model-a",
    provider: "openrouter",
  },
  {
    id: "assistant-1",
    parentId: "user-1",
    role: "assistant",
    text: "Answer",
    depth: 2,
    idx: 1,
    branchId: "branch-1",
    isBridge: false,
    model: "model-a",
    provider: "openrouter",
  },
];

const createParams = () => {
  const textArtifact = artifact({
    id: "artifact-1",
    artifactType: "text",
    title: "Context",
    content: "Reusable context",
  });
  const promptArtifact = artifact({
    id: "prompt-1",
    artifactType: "prompt",
    title: "Prompt",
    content: "Summarize",
    promptStatus: "idle",
  });
  const canvasLinks: SessionCanvasLink[] = [
    {
      id: "link-context",
      relation: "context",
      artifactId: textArtifact.id,
      promptId: promptArtifact.id,
      createdAt: timestamp,
    },
    {
      id: "link-output",
      relation: "output",
      artifactId: textArtifact.id,
      promptId: promptArtifact.id,
      responseId: null,
      createdAt: timestamp,
    },
  ];
  const handleCutEdge = vi.fn();

  return {
    artifacts: [textArtifact],
    artifactIndex: new Map([[textArtifact.id, textArtifact]]),
    canvasConversationNodes: conversationNodes,
    canvasLinks,
    canvasPrompts: [promptArtifact],
    cancelCanvasPrompt: vi.fn(),
    canvasDraftError: null,
    contextLinks: [
      {
        ...canvasLinks[0]!,
        relation: "context" as const,
        promptId: "user-1",
        targetMessageId: "user-1",
      },
    ],
    deleteArtifact: vi.fn(),
    draft: null,
    draftAnchorNode: null,
    draftBranchSpec: null,
    draftContextCount: 0,
    draftDetail: null,
    getArtifactsForTarget: vi.fn(() => []),
    handleCancelPromptDraft: vi.fn(),
    handleCancelRun: vi.fn(),
    handleCutEdge,
    handleSubmitBranchDraft: vi.fn(),
    isSubmittingBranch: false,
    isThreadRunning: false,
    linkedTargetCountByArtifact: new Map([[textArtifact.id, 2]]),
    linkEditMode: true,
    llmEnabled: true,
    nodeIndex: new Map(conversationNodes.map((node) => [node.id, node])),
    overrides: new Map<string, unknown>(),
    promptIndex: new Map([[promptArtifact.id, promptArtifact]]),
    requestError: null,
    runCanvasPrompt: vi.fn(),
    setDraftText: vi.fn(),
    setDraftContextScope: vi.fn(),
    updateArtifact: vi.fn(),
  };
};

describe("buildCanvasFlowElements", () => {
  it("builds conversation, prompt, artifact and relationship elements", () => {
    const params = createParams();
    const result = buildCanvasFlowElements(params);

    expect(new Set(result.nodes.map((node) => node.id))).toEqual(
      new Set([ROOT_NODE_ID, "user-1", "assistant-1", "prompt-1", "artifact-1"]),
    );
    expect(result.edges.some((edge) => edge.id === "context:artifact-1->user-1")).toBe(true);
    expect(result.edges.some((edge) => edge.id === "output:prompt-1->artifact-1")).toBe(true);

    const editableEdge = result.conversationEdges.find(
      (edge) => edge.source === "user-1" && edge.target === "assistant-1",
    );
    expect(editableEdge?.data?.editable).toBe(true);
    editableEdge?.data?.onCut?.();
    expect(params.handleCutEdge).toHaveBeenCalledWith("assistant-1", "user-1");
  });

  it("adds the branch draft only when a valid draft specification exists", () => {
    const params = createParams();
    const result = buildCanvasFlowElements({
      ...params,
      draft: {
        anchorId: "user-1",
        operation: "create-sibling-prompt",
        contextScope: null,
        text: "Alternative question",
        inputArtifactIds: [],
        outputArtifactIds: ["artifact-1"],
        position: { x: 10, y: 20 },
      },
      draftAnchorNode: conversationNodes[1]!,
      draftBranchSpec: {
        operation: "create-sibling-prompt",
        anchorId: "user-1",
        anchorRole: "user",
        parentId: ROOT_NODE_ID,
        sourceId: "user-1",
        targetRole: "user",
        startRun: true,
        placeholder: "Alternative",
        title: "Create sibling branch",
      },
      draftContextCount: 1,
      draftDetail: {
        operation: "create-sibling-prompt",
        title: "Create sibling branch",
        description: "Create a sibling branch.",
        placeholder: "Alternative",
        submitLabel: "Create branch",
      },
    });

    const draftNode = result.nodes.find((node) => node.id === CANVAS_PROMPT_DRAFT_NODE_ID);
    expect(draftNode?.data.draftContextCount).toBe(1);
    expect(draftNode?.data.draftOutputCount).toBe(1);
    expect(
      result.edges.some(
        (edge) => edge.id === `draft:${ROOT_NODE_ID}->${CANVAS_PROMPT_DRAFT_NODE_ID}`,
      ),
    ).toBe(true);
  });
});
