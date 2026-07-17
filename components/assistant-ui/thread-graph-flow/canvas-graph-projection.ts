import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import type {
  FlowDensityMode,
  FlowSpotlightMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";

type CanvasFilterCounts = Record<FlowSpotlightMode, number>;

type CanvasGraphProjection = {
  nodes: ThreadGraphFlowNode[];
  edges: ThreadGraphFlowEdge[];
};

const decoratedNodeVariants = new WeakMap<
  ThreadGraphFlowNode,
  Map<string, ThreadGraphFlowNode>
>();
const decoratedEdgeVariants = new WeakMap<
  ThreadGraphFlowEdge,
  Map<string, ThreadGraphFlowEdge>
>();

export function buildCanvasFilterCounts(
  canvasConversationNodes: ThreadGraphNodeModel[],
  artifactCount: number,
): CanvasFilterCounts {
  const counts: CanvasFilterCounts = {
    all: canvasConversationNodes.length + artifactCount,
    assistant: 0,
    user: 0,
    bridge: 0,
    edited: 0,
  };

  canvasConversationNodes.forEach((node) => {
    if (node.role === "assistant") counts.assistant += 1;
    if (node.role === "user") counts.user += 1;
    if (node.isBridge) counts.bridge += 1;
    if (node.editedFromId) counts.edited += 1;
  });

  return counts;
}

function matchesCanvasSpotlight(
  node: ThreadGraphNodeModel,
  spotlight: FlowSpotlightMode,
) {
  switch (spotlight) {
    case "assistant":
      return node.role === "assistant";
    case "user":
      return node.role === "user";
    case "bridge":
      return Boolean(node.isBridge);
    case "edited":
      return Boolean(node.editedFromId);
    default:
      return true;
  }
}

export function buildSelectedLineage({
  canvasConversationNodes,
  nodeIndex,
  selectedArtifactId,
  selectedNodeId,
}: {
  canvasConversationNodes: ThreadGraphNodeModel[];
  nodeIndex: Map<string, ThreadGraphNodeModel>;
  selectedArtifactId: string | null;
  selectedNodeId: string | null;
}) {
  if (!selectedNodeId || selectedArtifactId) return new Set<string>();
  const lineage = new Set<string>([selectedNodeId]);

  let currentId: string | null = selectedNodeId;
  while (currentId) {
    const currentNode = nodeIndex.get(currentId);
    const parentId = currentNode?.parentId ?? null;
    if (!parentId || lineage.has(parentId)) break;
    lineage.add(parentId);
    currentId = parentId;
  }

  const queue = [selectedNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    canvasConversationNodes.forEach((node) => {
      if (node.parentId === current && !lineage.has(node.id)) {
        lineage.add(node.id);
        queue.push(node.id);
      }
    });
  }

  return lineage;
}

export function buildFocusPathNodeIds({
  canvasConversationNodes,
  nodeIndex,
  selectedArtifactId,
  selectedContextArtifactIds,
  selectedContextLinkedMessageIds,
  selectedNodeId,
}: {
  canvasConversationNodes: ThreadGraphNodeModel[];
  nodeIndex: Map<string, ThreadGraphNodeModel>;
  selectedArtifactId: string | null;
  selectedContextArtifactIds: Set<string>;
  selectedContextLinkedMessageIds: Set<string>;
  selectedNodeId: string | null;
}) {
  if (!selectedNodeId) return new Set<string>();

  const focusIds = new Set<string>([selectedNodeId]);

  const addAncestors = (startId: string | null) => {
    let currentId = startId;
    while (currentId) {
      if (focusIds.has(currentId)) {
        const parentId = nodeIndex.get(currentId)?.parentId ?? null;
        if (!parentId || focusIds.has(parentId)) break;
      }
      focusIds.add(currentId);
      const parentId = nodeIndex.get(currentId)?.parentId ?? null;
      if (!parentId) break;
      currentId = parentId;
    }
  };

  if (selectedArtifactId) {
    selectedContextLinkedMessageIds.forEach((messageId) => {
      focusIds.add(messageId);
      addAncestors(messageId);
    });
    return focusIds;
  }

  addAncestors(selectedNodeId);

  canvasConversationNodes.forEach((node) => {
    if (node.parentId === selectedNodeId) focusIds.add(node.id);
  });

  selectedContextArtifactIds.forEach((artifactId) => {
    focusIds.add(artifactId);
  });

  return focusIds;
}

export function buildRelatedContextIds(
  selectedContextArtifactIds: Set<string>,
  selectedContextLinkedMessageIds: Set<string>,
) {
  return new Set<string>([
    ...selectedContextArtifactIds,
    ...selectedContextLinkedMessageIds,
  ]);
}

export function resolveCanvasVisibleNodeIds({
  densityMode,
  focusPathNodeIds,
  selectedNodeId,
}: {
  densityMode: FlowDensityMode;
  focusPathNodeIds: Set<string>;
  selectedNodeId: string | null;
}) {
  if (densityMode !== "focus" || !selectedNodeId) return null;
  return focusPathNodeIds;
}

export function filterCanvasGraph(
  nodes: ThreadGraphFlowNode[],
  edges: ThreadGraphFlowEdge[],
  visibleNodeIds: Set<string> | null,
): CanvasGraphProjection {
  if (!visibleNodeIds) return { nodes, edges };

  return {
    nodes: nodes.filter((node) => visibleNodeIds.has(node.id)),
    edges: edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    ),
  };
}

export function decorateCanvasNodes({
  nodeIndex,
  relatedContextIds,
  selectedLineage,
  selectedNodeId,
  spotlight,
  visibleFlowNodes,
}: {
  nodeIndex: Map<string, ThreadGraphNodeModel>;
  relatedContextIds: Set<string>;
  selectedLineage: Set<string>;
  selectedNodeId: string | null;
  spotlight: FlowSpotlightMode;
  visibleFlowNodes: ThreadGraphFlowNode[];
}) {
  let changed = false;
  const decoratedNodes = visibleFlowNodes.map((node) => {
    const originalNode = nodeIndex.get(node.id);
    const filterMatched = originalNode
      ? matchesCanvasSpotlight(originalNode, spotlight)
      : true;
    const emphasis: NonNullable<ThreadGraphFlowNode["data"]["emphasis"]> =
      selectedNodeId == null
        ? filterMatched || spotlight === "all" || node.data.kind === "artifact"
          ? "normal"
          : "muted"
        : node.id === selectedNodeId
          ? "selected"
          : selectedLineage.has(node.id) || relatedContextIds.has(node.id)
            ? "lineage"
            : "muted";
    const selected = emphasis === "selected" ? true : undefined;
    const dataMatches =
      (node.data.emphasis ?? "normal") === emphasis &&
      (node.data.filterMatched ?? true) === filterMatched;
    const selectionMatches = node.selected === selected;

    if (dataMatches && selectionMatches) return node;

    changed = true;
    const variantKey = `${emphasis}:${filterMatched ? 1 : 0}:${selected ? 1 : 0}`;
    let variants = decoratedNodeVariants.get(node);
    if (!variants) {
      variants = new Map();
      decoratedNodeVariants.set(node, variants);
    }
    const cached = variants.get(variantKey);
    if (cached) return cached;

    const decoratedNode = {
      ...node,
      selected,
      data: dataMatches
        ? node.data
        : {
            ...node.data,
            emphasis,
            filterMatched,
          },
    };
    variants.set(variantKey, decoratedNode);
    return decoratedNode;
  });

  return changed ? decoratedNodes : visibleFlowNodes;
}

export function decorateCanvasEdges({
  decoratedFlowNodes,
  relatedContextIds,
  selectedLineage,
  selectedNodeId,
  spotlight,
  visibleFlowEdges,
}: {
  decoratedFlowNodes: ThreadGraphFlowNode[];
  relatedContextIds: Set<string>;
  selectedLineage: Set<string>;
  selectedNodeId: string | null;
  spotlight: FlowSpotlightMode;
  visibleFlowEdges: ThreadGraphFlowEdge[];
}) {
  const nodeMatchIndex = new Map(
    decoratedFlowNodes.map((node) => [node.id, node.data.filterMatched ?? true]),
  );

  let changed = false;
  const decoratedEdges = visibleFlowEdges.map((edge) => {
    const sourceInLineage =
      selectedLineage.has(edge.source) || relatedContextIds.has(edge.source);
    const targetInLineage =
      selectedLineage.has(edge.target) || relatedContextIds.has(edge.target);
    const sourceMatched = nodeMatchIndex.get(edge.source) ?? true;
    const targetMatched = nodeMatchIndex.get(edge.target) ?? true;

    const emphasis: "normal" | "selected" | "lineage" | "muted" =
      selectedNodeId == null
        ? spotlight === "all" ||
          (sourceMatched && targetMatched) ||
          edge.data?.tone === "context"
          ? "normal"
          : "muted"
        : sourceInLineage && targetInLineage
          ? edge.target === selectedNodeId || edge.source === selectedNodeId
            ? "selected"
            : "lineage"
          : "muted";

    if ((edge.data?.emphasis ?? "normal") === emphasis) return edge;

    changed = true;
    let variants = decoratedEdgeVariants.get(edge);
    if (!variants) {
      variants = new Map();
      decoratedEdgeVariants.set(edge, variants);
    }
    const cached = variants.get(emphasis);
    if (cached) return cached;

    const decoratedEdge = {
      ...edge,
      data: {
        ...edge.data,
        emphasis,
      },
    };
    variants.set(emphasis, decoratedEdge);
    return decoratedEdge;
  });

  return changed ? decoratedEdges : visibleFlowEdges;
}

export function buildGraphStructureSignature(
  nodes: ThreadGraphFlowNode[],
  edges: ThreadGraphFlowEdge[],
) {
  return [
    nodes
      .map(
        (node) =>
          `${node.id}:${String(node.data.branchId ?? "")}:${node.data.kind ?? "message"}`,
      )
      .join("|"),
    edges.map((edge) => `${edge.id}:${edge.source}->${edge.target}`).join("|"),
  ].join("::");
}

export function buildTreeStructureSignature(
  canvasConversationNodes: ThreadGraphNodeModel[],
  baseConversationEdges: ThreadGraphFlowEdge[],
) {
  return [
    canvasConversationNodes
      .map((node) => `${node.id}:${String(node.branchId ?? "")}`)
      .join("|"),
    baseConversationEdges
      .map((edge) => `${edge.source}->${edge.target}`)
      .join("|"),
  ].join("::");
}
