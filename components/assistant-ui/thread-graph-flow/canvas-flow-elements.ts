import {
  buildCanvasPromptResponseEdges,
  buildContextFlowEdges,
  buildConversationFlowEdges,
  buildDraftFlowEdges,
  buildOutputFlowEdges,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-edges";
import { buildCanvasFlowIndexes } from "@/components/assistant-ui/thread-graph-flow/canvas-flow-indexes";
import {
  buildArtifactFlowNodes,
  buildCanvasPromptFlowNodes,
  buildCanvasResponseFlowNodes,
  buildConversationFlowNodes,
  buildDraftFlowNodes,
  createCanvasModelVisualResolver,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-nodes";
import type {
  CanvasFlowElements,
  CanvasFlowElementsParams,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements-types";
import { layoutThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-layout";

export type {
  CanvasFlowElements,
  CanvasFlowElementsParams,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements-types";

type FlowNode = CanvasFlowElements["nodes"][number];
type FlowEdge = CanvasFlowElements["edges"][number];
type NodePosition = { x: number; y: number };
type LayoutCacheEntry = {
  positions: Map<string, NodePosition>;
};

const MAX_LAYOUT_CACHE_ENTRIES = 8;
const layoutCache = new Map<string, LayoutCacheEntry>();

const buildTopologySignature = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const nodeSignature = nodes
    .map((node) => `${node.id}:${node.type ?? ""}`)
    .join("|");
  const edgeSignature = edges
    .map(
      (edge) =>
        `${edge.id}:${edge.source}>${edge.target}:${edge.sourceHandle ?? ""}:${edge.targetHandle ?? ""}:${edge.type ?? ""}`,
    )
    .join("|");
  return `${nodeSignature}::${edgeSignature}`;
};

const readCachedLayout = (signature: string) => {
  const cached = layoutCache.get(signature);
  if (!cached) return null;

  // Refresh insertion order so frequently used graph shapes stay in the small LRU cache.
  layoutCache.delete(signature);
  layoutCache.set(signature, cached);
  return cached;
};

const storeLayout = (signature: string, nodes: FlowNode[]) => {
  layoutCache.set(signature, {
    positions: new Map(
      nodes.map((node) => [
        node.id,
        { x: node.position.x, y: node.position.y },
      ]),
    ),
  });

  while (layoutCache.size > MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = layoutCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    layoutCache.delete(oldestKey);
  }
};

const applyCachedPositions = (
  nodes: FlowNode[],
  cached: LayoutCacheEntry,
): FlowNode[] =>
  nodes.map((node) => {
    const position = cached.positions.get(node.id);
    if (!position) return node;
    if (node.position.x === position.x && node.position.y === position.y) return node;
    return { ...node, position };
  });

export function buildCanvasFlowElements(
  params: CanvasFlowElementsParams,
): CanvasFlowElements {
  const indexes = buildCanvasFlowIndexes(
    params.canvasLinks,
    params.artifactIndex,
  );
  const resolveModelVisual = createCanvasModelVisualResolver();

  const conversationNodes = buildConversationFlowNodes({
    canvasConversationNodes: params.canvasConversationNodes,
    handleNodeBranchOperation: params.handleNodeBranchOperation,
    onNodeContextScopeChange: params.onNodeContextScopeChange,
    linkedArtifactCountByTarget: indexes.linkedArtifactCountByTarget,
    overrides: params.overrides,
    resolveModelVisual,
  });
  const draftNodes = buildDraftFlowNodes(params);
  const canvasPromptNodes = buildCanvasPromptFlowNodes({
    canvasPrompts: params.canvasPrompts,
    cancelCanvasPrompt: params.cancelCanvasPrompt,
    deleteArtifact: params.deleteArtifact,
    llmEnabled: params.llmEnabled,
    promptLinkCountById: indexes.promptLinkCountById,
    runCanvasPrompt: params.runCanvasPrompt,
    updateArtifact: params.updateArtifact,
  });
  const canvasResponseNodes = buildCanvasResponseFlowNodes({
    canvasPrompts: params.canvasPrompts,
  });
  const artifactNodes = buildArtifactFlowNodes({
    artifacts: params.artifacts,
    linkedTargetCountByArtifact: params.linkedTargetCountByArtifact,
  });

  const conversationEdges = buildConversationFlowEdges({
    canvasConversationNodes: params.canvasConversationNodes,
    handleCutEdge: params.handleCutEdge,
    linkEditMode: params.linkEditMode,
    nodeIndex: params.nodeIndex,
    resolveModelVisual,
  });
  const draftEdges = buildDraftFlowEdges({
    draftBranchSpec: params.draftBranchSpec,
    nodeIndex: params.nodeIndex,
  });
  const promptResponseEdges = buildCanvasPromptResponseEdges({
    canvasPrompts: params.canvasPrompts,
  });
  const contextEdges = buildContextFlowEdges({
    artifactIndex: params.artifactIndex,
    contextLinks: params.contextLinks,
    nodeIndex: params.nodeIndex,
    promptIndex: params.promptIndex,
  });
  const outputEdges = buildOutputFlowEdges({
    artifactIndex: params.artifactIndex,
    canvasLinks: params.canvasLinks,
    nodeIndex: params.nodeIndex,
    promptIndex: params.promptIndex,
  });

  const nodes = [
    ...conversationNodes,
    ...draftNodes,
    ...canvasPromptNodes,
    ...canvasResponseNodes,
    ...artifactNodes,
  ];
  const edges = [
    ...conversationEdges,
    ...draftEdges,
    ...promptResponseEdges,
    ...contextEdges,
    ...outputEdges,
  ];
  const topologySignature = buildTopologySignature(nodes, edges);
  const cachedLayout = readCachedLayout(topologySignature);

  if (cachedLayout) {
    return {
      conversationEdges,
      edges,
      nodes: applyCachedPositions(nodes, cachedLayout),
    };
  }

  const laidOut = layoutThreadGraphFlow(nodes, edges);
  storeLayout(topologySignature, laidOut.nodes);

  return {
    conversationEdges,
    edges: laidOut.edges,
    nodes: laidOut.nodes,
  };
}
