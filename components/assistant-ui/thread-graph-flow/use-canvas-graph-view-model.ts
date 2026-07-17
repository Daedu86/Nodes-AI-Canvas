"use client";

import React from "react";
import { buildGraphLegendItems } from "@/components/assistant-ui/thread-graph/graph-models";
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
} from "@/components/assistant-ui/thread-graph-flow/canvas-graph-projection";
import {
  buildCanvasFlowElements,
  type CanvasFlowElementsParams,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import {
  artifactAccent,
  type FlowDensityMode,
  type FlowSpotlightMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";
import type { SessionArtifact } from "@/lib/session-artifacts";

type UseCanvasGraphViewModelOptions = Omit<
  CanvasFlowElementsParams,
  "linkedTargetCountByArtifact" | "nodeIndex"
> & {
  nodeIndex: Map<string, ThreadGraphNodeModel>;
  densityMode: FlowDensityMode;
  legendNodes: ThreadGraphNodeModel[];
  selectedArtifactId: string | null;
  selectedContextArtifactIds: Set<string>;
  selectedNodeId: string | null;
  spotlight: FlowSpotlightMode;
};

export function buildCanvasLegendItems(
  legendNodes: ThreadGraphNodeModel[],
  artifacts: SessionArtifact[],
  canvasPrompts: SessionArtifact[],
) {
  const conversationLegend = buildGraphLegendItems(legendNodes);
  const hasTextArtifacts = artifacts.some((artifact) => artifact.artifactType === "text");
  const hasCodeArtifacts = artifacts.some((artifact) => artifact.artifactType === "code");
  const hasImageArtifacts = artifacts.some((artifact) => artifact.artifactType === "image");
  const hasFileArtifacts = artifacts.some((artifact) => artifact.artifactType === "file");
  const hasCanvasPrompts = canvasPrompts.length > 0;

  return [
    ...conversationLegend,
    ...(hasTextArtifacts
      ? [{ key: "artifact-text", label: "Text Context", swatch: artifactAccent("text") }]
      : []),
    ...(hasCodeArtifacts
      ? [{ key: "artifact-code", label: "Code Context", swatch: artifactAccent("code") }]
      : []),
    ...(hasImageArtifacts
      ? [{ key: "artifact-image", label: "Image Context", swatch: artifactAccent("image") }]
      : []),
    ...(hasFileArtifacts
      ? [{ key: "artifact-file", label: "File Context", swatch: artifactAccent("file") }]
      : []),
    ...(hasCanvasPrompts
      ? [{ key: "canvas-prompt", label: "Independent Prompt", swatch: artifactAccent("prompt") }]
      : []),
  ];
}

export function useCanvasGraphViewModel({
  artifacts,
  artifactIndex,
  canvasConversationNodes,
  canvasLinks,
  canvasPrompts,
  cancelCanvasPrompt,
  canvasDraftError,
  contextLinks,
  deleteArtifact,
  densityMode,
  draft,
  draftAnchorNode,
  draftBranchSpec,
  draftContextCount,
  draftDetail,
  getArtifactsForTarget,
  handleCancelPromptDraft,
  handleNodeBranchOperation,
  onNodeContextScopeChange,
  handleCancelRun,
  handleCutEdge,
  handleSubmitBranchDraft,
  isSubmittingBranch,
  isThreadRunning,
  legendNodes,
  linkEditMode,
  llmEnabled,
  nodeIndex,
  overrides,
  promptIndex,
  requestError,
  runCanvasPrompt,
  selectedArtifactId,
  selectedContextArtifactIds,
  selectedNodeId,
  setDraftText,
  setDraftContextScope,
  spotlight,
  updateArtifact,
}: UseCanvasGraphViewModelOptions) {
  const linkedTargetCountByArtifact = React.useMemo(() => {
    const counts = new Map<string, number>();
    canvasLinks.forEach((link) => {
      counts.set(link.artifactId, (counts.get(link.artifactId) ?? 0) + 1);
    });
    return counts;
  }, [canvasLinks]);

  const selectedContextLinkedMessageIds = React.useMemo(() => {
    if (!selectedArtifactId) return new Set<string>();
    return new Set(
      contextLinks
        .filter((link) => link.artifactId === selectedArtifactId)
        .map((link) => link.targetMessageId),
    );
  }, [contextLinks, selectedArtifactId]);

  const filterCounts = React.useMemo(
    () => buildCanvasFilterCounts(canvasConversationNodes, artifacts.length),
    [artifacts.length, canvasConversationNodes],
  );
  const selectedLineage = React.useMemo(
    () =>
      buildSelectedLineage({
        canvasConversationNodes,
        nodeIndex,
        selectedArtifactId,
        selectedNodeId,
      }),
    [canvasConversationNodes, nodeIndex, selectedArtifactId, selectedNodeId],
  );
  const focusPathNodeIds = React.useMemo(
    () =>
      buildFocusPathNodeIds({
        canvasConversationNodes,
        nodeIndex,
        selectedArtifactId,
        selectedContextArtifactIds,
        selectedContextLinkedMessageIds,
        selectedNodeId,
      }),
    [
      canvasConversationNodes,
      nodeIndex,
      selectedArtifactId,
      selectedContextArtifactIds,
      selectedContextLinkedMessageIds,
      selectedNodeId,
    ],
  );
  const relatedContextIds = React.useMemo(
    () =>
      buildRelatedContextIds(
        selectedContextArtifactIds,
        selectedContextLinkedMessageIds,
      ),
    [selectedContextArtifactIds, selectedContextLinkedMessageIds],
  );

  const flowElementParams = React.useMemo<CanvasFlowElementsParams>(
    () => ({
      artifacts,
      artifactIndex,
      canvasConversationNodes,
      canvasLinks,
      canvasPrompts,
      cancelCanvasPrompt,
      canvasDraftError,
      contextLinks,
      deleteArtifact,
      draft,
      draftAnchorNode,
      draftBranchSpec,
      draftContextCount,
      draftDetail,
      getArtifactsForTarget,
      handleCancelPromptDraft,
      handleNodeBranchOperation,
      onNodeContextScopeChange,
      handleCancelRun,
      handleCutEdge,
      handleSubmitBranchDraft,
      isSubmittingBranch,
      isThreadRunning,
      linkedTargetCountByArtifact,
      linkEditMode,
      llmEnabled,
      nodeIndex,
      overrides,
      promptIndex,
      requestError,
      runCanvasPrompt,
      setDraftText,
      setDraftContextScope,
      updateArtifact,
    }),
    [
      artifacts,
      artifactIndex,
      canvasConversationNodes,
      canvasLinks,
      canvasPrompts,
      cancelCanvasPrompt,
      canvasDraftError,
      contextLinks,
      deleteArtifact,
      draft,
      draftAnchorNode,
      draftBranchSpec,
      draftContextCount,
      draftDetail,
      getArtifactsForTarget,
      handleCancelPromptDraft,
      handleNodeBranchOperation,
      onNodeContextScopeChange,
      handleCancelRun,
      handleCutEdge,
      handleSubmitBranchDraft,
      isSubmittingBranch,
      isThreadRunning,
      linkedTargetCountByArtifact,
      linkEditMode,
      llmEnabled,
      nodeIndex,
      overrides,
      promptIndex,
      requestError,
      runCanvasPrompt,
      setDraftText,
      setDraftContextScope,
      updateArtifact,
    ],
  );

  const { conversationEdges, edges: flowEdges, nodes: flowNodes } = React.useMemo(
    () => buildCanvasFlowElements(flowElementParams),
    [flowElementParams],
  );
  const visibleNodeIds = React.useMemo(
    () =>
      resolveCanvasVisibleNodeIds({
        densityMode,
        focusPathNodeIds,
        selectedNodeId,
      }),
    [densityMode, focusPathNodeIds, selectedNodeId],
  );
  const { nodes: visibleFlowNodes, edges: visibleFlowEdges } = React.useMemo(
    () => filterCanvasGraph(flowNodes, flowEdges, visibleNodeIds),
    [flowEdges, flowNodes, visibleNodeIds],
  );
  const decoratedFlowNodes = React.useMemo(
    () =>
      decorateCanvasNodes({
        nodeIndex,
        relatedContextIds,
        selectedLineage,
        selectedNodeId,
        spotlight,
        visibleFlowNodes,
      }),
    [
      nodeIndex,
      relatedContextIds,
      selectedLineage,
      selectedNodeId,
      spotlight,
      visibleFlowNodes,
    ],
  );
  const decoratedFlowEdges = React.useMemo(
    () =>
      decorateCanvasEdges({
        decoratedFlowNodes,
        relatedContextIds,
        selectedLineage,
        selectedNodeId,
        spotlight,
        visibleFlowEdges,
      }),
    [
      decoratedFlowNodes,
      relatedContextIds,
      selectedLineage,
      selectedNodeId,
      spotlight,
      visibleFlowEdges,
    ],
  );
  const graphStructureSignature = React.useMemo(
    () => buildGraphStructureSignature(visibleFlowNodes, visibleFlowEdges),
    [visibleFlowEdges, visibleFlowNodes],
  );
  const treeStructureSignature = React.useMemo(
    () => buildTreeStructureSignature(canvasConversationNodes, conversationEdges),
    [canvasConversationNodes, conversationEdges],
  );
  const legendItems = React.useMemo(
    () => buildCanvasLegendItems(legendNodes, artifacts, canvasPrompts),
    [artifacts, canvasPrompts, legendNodes],
  );
  const selectedFlowNode = React.useMemo(
    () => decoratedFlowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [decoratedFlowNodes, selectedNodeId],
  );
  const visibleCanvasNodeCount = decoratedFlowNodes.length;

  return {
    decoratedFlowEdges,
    decoratedFlowNodes,
    filterCounts,
    flowNodeCount: flowNodes.length,
    graphStructureSignature,
    hiddenCanvasNodeCount: Math.max(0, flowNodes.length - visibleCanvasNodeCount),
    legendItems,
    selectedContextLinkedMessageIds,
    selectedFlowNode,
    treeStructureSignature,
    visibleCanvasNodeCount,
  };
}
