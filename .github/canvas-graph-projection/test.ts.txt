import { describe, expect, it } from "vitest";
import {
  buildCanvasFilterCounts,
  buildFocusPathNodeIds,
  buildGraphStructureSignature,
  buildRelatedContextIds,
  buildSelectedLineage,
  buildTreeStructureSignature,
  decorateCanvasEdges,
  decorateCanvasNodes,
  filterCanvasGraph,
  resolveCanvasVisibleNodeIds,
} from "../components/assistant-ui/thread-graph-flow/canvas-graph-projection";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "../components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import type { Node as ThreadGraphNodeModel } from "../components/assistant-ui/thread-graph/graph-types";

const conversationNodes: ThreadGraphNodeModel[] = [
  {
    id: "__ROOT__",
    parentId: null,
    role: "ROOT",
    text: "Conversation Root",
    depth: 0,
    idx: -1,
    branchId: null,
  },
  {
    id: "user-1",
    parentId: "__ROOT__",
    role: "user",
    text: "Question",
    depth: 1,
    idx: 0,
    branchId: "main",
  },
  {
    id: "assistant-1",
    parentId: "user-1",
    role: "assistant",
    text: "Answer",
    depth: 2,
    idx: 1,
    branchId: "main",
  },
  {
    id: "user-edited",
    parentId: "assistant-1",
    role: "user",
    text: "Edited question",
    depth: 3,
    idx: 2,
    branchId: "main",
    editedFromId: "user-1",
  },
];

const nodeIndex = new Map(conversationNodes.map((node) => [node.id, node]));

const flowNodes: ThreadGraphFlowNode[] = [
  ...conversationNodes.map((node) => ({
    id: node.id,
    position: { x: 0, y: 0 },
    data: {
      kind: node.id === "__ROOT__" ? ("root" as const) : ("message" as const),
      preview: node.text,
      role: node.role,
      branchId:
        typeof node.branchId === "string" || typeof node.branchId === "number"
          ? node.branchId
          : null,
    },
  })),
  {
    id: "artifact-1",
    position: { x: 0, y: 0 },
    data: {
      kind: "artifact",
      preview: "Context",
      role: "artifact",
      title: "Context",
    },
  },
];

const flowEdges: ThreadGraphFlowEdge[] = [
  {
    id: "root-user",
    source: "__ROOT__",
    target: "user-1",
    data: { tone: "default" },
  },
  {
    id: "user-assistant",
    source: "user-1",
    target: "assistant-1",
    data: { tone: "default" },
  },
  {
    id: "context-assistant",
    source: "artifact-1",
    target: "assistant-1",
    data: { tone: "context" },
  },
];

describe("canvas graph projection", () => {
  it("counts spotlight categories without mounting the canvas", () => {
    expect(buildCanvasFilterCounts(conversationNodes, 1)).toEqual({
      all: 5,
      assistant: 1,
      user: 2,
      bridge: 0,
      edited: 1,
    });
  });

  it("builds lineage and artifact focus paths", () => {
    expect(
      buildSelectedLineage({
        canvasConversationNodes: conversationNodes,
        nodeIndex,
        selectedArtifactId: null,
        selectedNodeId: "user-1",
      }),
    ).toEqual(new Set(["user-1", "__ROOT__", "assistant-1", "user-edited"]));

    expect(
      buildFocusPathNodeIds({
        canvasConversationNodes: conversationNodes,
        nodeIndex,
        selectedArtifactId: "artifact-1",
        selectedContextArtifactIds: new Set(),
        selectedContextLinkedMessageIds: new Set(["assistant-1"]),
        selectedNodeId: "artifact-1",
      }),
    ).toEqual(new Set(["artifact-1", "assistant-1", "user-1", "__ROOT__"]));
  });

  it("filters focus mode and decorates spotlight emphasis", () => {
    const visibleNodeIds = resolveCanvasVisibleNodeIds({
      densityMode: "focus",
      focusPathNodeIds: new Set(["__ROOT__", "user-1"]),
      selectedNodeId: "user-1",
    });
    const visible = filterCanvasGraph(flowNodes, flowEdges, visibleNodeIds);
    expect(visible.nodes.map((node) => node.id)).toEqual(["__ROOT__", "user-1"]);
    expect(visible.edges.map((edge) => edge.id)).toEqual(["root-user"]);

    const relatedContextIds = buildRelatedContextIds(
      new Set(["artifact-1"]),
      new Set(),
    );
    const decoratedNodes = decorateCanvasNodes({
      nodeIndex,
      relatedContextIds,
      selectedLineage: new Set(),
      selectedNodeId: null,
      spotlight: "assistant",
      visibleFlowNodes: flowNodes,
    });
    expect(
      decoratedNodes.find((node) => node.id === "assistant-1")?.data.emphasis,
    ).toBe("normal");
    expect(decoratedNodes.find((node) => node.id === "user-1")?.data.emphasis).toBe(
      "muted",
    );
    expect(
      decoratedNodes.find((node) => node.id === "artifact-1")?.data.emphasis,
    ).toBe("normal");

    const decoratedEdges = decorateCanvasEdges({
      decoratedFlowNodes: decoratedNodes,
      relatedContextIds,
      selectedLineage: new Set(),
      selectedNodeId: null,
      spotlight: "assistant",
      visibleFlowEdges: flowEdges,
    });
    expect(
      decoratedEdges.find((edge) => edge.id === "context-assistant")?.data?.emphasis,
    ).toBe("normal");
    expect(
      decoratedEdges.find((edge) => edge.id === "root-user")?.data?.emphasis,
    ).toBe("muted");
  });

  it("creates stable structure signatures", () => {
    expect(buildGraphStructureSignature(flowNodes, flowEdges)).toContain(
      "artifact-1::artifact::root-user:__ROOT__->user-1",
    );
    expect(buildTreeStructureSignature(conversationNodes, flowEdges)).toContain(
      "assistant-1:main",
    );
  });
});
