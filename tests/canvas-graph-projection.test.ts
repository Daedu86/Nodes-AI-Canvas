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
      decoratedNodes.find((node) => node.id === "assistant-1")?.data.emphasis ??
        "normal",
    ).toBe("normal");
    expect(decoratedNodes.find((node) => node.id === "user-1")?.data.emphasis).toBe(
      "muted",
    );
    expect(
      decoratedNodes.find((node) => node.id === "artifact-1")?.data.emphasis ??
        "normal",
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
      decoratedEdges.find((edge) => edge.id === "context-assistant")?.data
        ?.emphasis ?? "normal",
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

  it("preserves references across adjacent selections in a 500-node graph", () => {
    const largeNodes: ThreadGraphFlowNode[] = Array.from(
      { length: 500 },
      (_, index) => ({
        id: `node-${index}`,
        position: { x: index, y: 0 },
        data: {
          emphasis: "normal",
          filterMatched: true,
          preview: `Node ${index}`,
          role: index % 2 === 0 ? "user" : "assistant",
        },
      }),
    );
    const largeEdges: ThreadGraphFlowEdge[] = Array.from(
      { length: 499 },
      (_, index) => ({
        id: `edge-${index}`,
        source: `node-${index}`,
        target: `node-${index + 1}`,
        data: { emphasis: "normal", tone: "default" },
      }),
    );

    const decoratedNodes = decorateCanvasNodes({
      nodeIndex: new Map(),
      relatedContextIds: new Set(),
      selectedLineage: new Set(),
      selectedNodeId: null,
      spotlight: "all",
      visibleFlowNodes: largeNodes,
    });
    expect(decoratedNodes).toBe(largeNodes);
    decoratedNodes.forEach((node, index) => {
      expect(node).toBe(largeNodes[index]);
      expect(node.data).toBe(largeNodes[index]?.data);
    });

    const decoratedEdges = decorateCanvasEdges({
      decoratedFlowNodes: decoratedNodes,
      relatedContextIds: new Set(),
      selectedLineage: new Set(),
      selectedNodeId: null,
      spotlight: "all",
      visibleFlowEdges: largeEdges,
    });
    expect(decoratedEdges).toBe(largeEdges);
    decoratedEdges.forEach((edge, index) => {
      expect(edge).toBe(largeEdges[index]);
      expect(edge.data).toBe(largeEdges[index]?.data);
    });

    const allNodeIds = new Set(largeNodes.map((node) => node.id));
    const selected250 = decorateCanvasNodes({
      nodeIndex: new Map(),
      relatedContextIds: new Set(),
      selectedLineage: allNodeIds,
      selectedNodeId: "node-250",
      spotlight: "all",
      visibleFlowNodes: largeNodes,
    });
    const edges250 = decorateCanvasEdges({
      decoratedFlowNodes: selected250,
      relatedContextIds: new Set(),
      selectedLineage: allNodeIds,
      selectedNodeId: "node-250",
      spotlight: "all",
      visibleFlowEdges: largeEdges,
    });
    const selected251 = decorateCanvasNodes({
      nodeIndex: new Map(),
      relatedContextIds: new Set(),
      selectedLineage: allNodeIds,
      selectedNodeId: "node-251",
      spotlight: "all",
      visibleFlowNodes: largeNodes,
    });
    const edges251 = decorateCanvasEdges({
      decoratedFlowNodes: selected251,
      relatedContextIds: new Set(),
      selectedLineage: allNodeIds,
      selectedNodeId: "node-251",
      spotlight: "all",
      visibleFlowEdges: largeEdges,
    });

    expect(
      selected251.filter((node, index) => node !== selected250[index]),
    ).toHaveLength(2);
    expect(
      selected251.filter(
        (node, index) => node.data !== selected250[index]?.data,
      ),
    ).toHaveLength(2);
    expect(edges251.filter((edge, index) => edge !== edges250[index])).toHaveLength(2);
    expect(
      edges251.filter((edge, index) => edge.data !== edges250[index]?.data),
    ).toHaveLength(2);
    expect(selected250[250]?.selected).toBe(true);
    expect(selected251[251]?.selected).toBe(true);
  });

  it("sets selected explicitly and reuses nodes whose derived state is unchanged", () => {
    const selectedCandidate: ThreadGraphFlowNode = {
      id: "selected",
      position: { x: 0, y: 0 },
      data: {
        emphasis: "normal",
        filterMatched: true,
        preview: "Selected",
        role: "artifact",
      },
    };
    const alreadyMuted: ThreadGraphFlowNode = {
      id: "muted",
      position: { x: 1, y: 0 },
      data: {
        emphasis: "muted",
        filterMatched: true,
        preview: "Muted",
        role: "artifact",
      },
    };

    const decorated = decorateCanvasNodes({
      nodeIndex: new Map(),
      relatedContextIds: new Set(),
      selectedLineage: new Set(),
      selectedNodeId: selectedCandidate.id,
      spotlight: "all",
      visibleFlowNodes: [selectedCandidate, alreadyMuted],
    });

    expect(decorated[0]).not.toBe(selectedCandidate);
    expect(decorated[0]?.selected).toBe(true);
    expect(decorated[0]?.data.emphasis).toBe("selected");
    expect(decorated[1]).toBe(alreadyMuted);
    expect(decorated[1]?.data).toBe(alreadyMuted.data);

    const redecorated = decorateCanvasNodes({
      nodeIndex: new Map(),
      relatedContextIds: new Set(),
      selectedLineage: new Set(),
      selectedNodeId: selectedCandidate.id,
      spotlight: "all",
      visibleFlowNodes: [selectedCandidate, alreadyMuted],
    });
    expect(redecorated[0]).toBe(decorated[0]);
    expect(redecorated[1]).toBe(decorated[1]);
  });
});
