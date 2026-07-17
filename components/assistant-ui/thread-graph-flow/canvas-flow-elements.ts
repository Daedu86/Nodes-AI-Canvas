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

  const laidOut = layoutThreadGraphFlow(
    [
      ...conversationNodes,
      ...draftNodes,
      ...canvasPromptNodes,
      ...canvasResponseNodes,
      ...artifactNodes,
    ],
    [
      ...conversationEdges,
      ...draftEdges,
      ...promptResponseEdges,
      ...contextEdges,
      ...outputEdges,
    ],
  );

  return {
    conversationEdges,
    edges: laidOut.edges,
    nodes: laidOut.nodes,
  };
}
