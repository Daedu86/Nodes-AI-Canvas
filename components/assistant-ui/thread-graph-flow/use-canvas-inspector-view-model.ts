"use client";

import React from "react";
import {
  getArtifactLineCount,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import { estimateDataUrlBytes } from "@/components/assistant-ui/thread-graph-flow/canvas-upload-utils";
import {
  artifactTypeLabel,
  formatByteSize,
  trimArtifactPreview,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import {
  ROOT_NODE_ID,
  type Node as ThreadGraphNodeModel,
} from "@/components/assistant-ui/thread-graph/graph-types";
import type { GraphBranchIntent } from "@/components/context/graph-branch-intent";
import {
  getAllowedBranchOperations,
  getBranchOperationDetail,
} from "@/lib/thread-branching";
import type { SessionArtifact } from "@/lib/session-artifacts";

type UseCanvasInspectorViewModelOptions = {
  canvasConversationNodes: ThreadGraphNodeModel[];
  draft: GraphBranchIntent | null;
  inspectorScrollRef: React.RefObject<HTMLDivElement | null>;
  linkEditMode: boolean;
  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;
  resetLinkCount: number;
  selectedArtifact: SessionArtifact | null;
  selectedContextArtifacts: SessionArtifact[];
  selectedFlowNode: ThreadGraphFlowNode | null;
  selectedMessageNode: ThreadGraphNodeModel | null;
  selectedNodeId: string | null;
};

export function buildCanvasBranchTrail(
  selectedMessageNode: ThreadGraphNodeModel | null,
  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>,
) {
  if (!selectedMessageNode) return [];

  const formatTrailLabel = (node: ThreadGraphNodeModel) => {
    if (node.id === ROOT_NODE_ID) return "root";
    const preview = node.text.replace(/\s+/g, " ").trim();
    if (!preview) return node.role === "assistant" ? "assistant reply" : "user prompt";
    return preview.length > 28 ? `${preview.slice(0, 25)}...` : preview;
  };

  const trail: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = selectedMessageNode.id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodeIndex.get(currentId);
    if (!node) break;
    trail.unshift(formatTrailLabel(node));
    currentId = node.parentId;
  }

  return trail;
}

export function useCanvasInspectorViewModel({
  canvasConversationNodes,
  draft,
  inspectorScrollRef,
  linkEditMode,
  nodeIndex,
  resetLinkCount,
  selectedArtifact,
  selectedContextArtifacts,
  selectedFlowNode,
  selectedMessageNode,
  selectedNodeId,
}: UseCanvasInspectorViewModelOptions) {
  React.useEffect(() => {
    const inspector = inspectorScrollRef.current;
    if (!inspector) return;
    inspector.scrollTop = 0;
  }, [
    draft?.anchorId,
    draft?.operation,
    inspectorScrollRef,
    linkEditMode,
    selectedArtifact?.id,
    selectedMessageNode?.id,
    selectedNodeId,
  ]);

  const selectedBranchOptions = React.useMemo(() => {
    if (!selectedMessageNode) return [];
    return getAllowedBranchOperations(selectedMessageNode).map(getBranchOperationDetail);
  }, [selectedMessageNode]);
  const selectedBranchPathLabel = React.useMemo(
    () => buildCanvasBranchTrail(selectedMessageNode, nodeIndex).join(" > "),
    [nodeIndex, selectedMessageNode],
  );
  const selectedPreview =
    selectedFlowNode?.data.preview?.replace(/\s+/g, " ").trim() ?? "";
  const selectedArtifactSize = formatByteSize(selectedArtifact?.byteSize);
  const selectedArtifactPreviewSize = selectedArtifact?.sourceDataUrl
    ? formatByteSize(estimateDataUrlBytes(selectedArtifact.sourceDataUrl))
    : null;
  const selectedArtifactStatChips = React.useMemo(
    () => (selectedArtifact ? getArtifactStatChips(selectedArtifact) : []),
    [selectedArtifact],
  );
  const selectedArtifactLineCount = React.useMemo(
    () => (selectedArtifact ? getArtifactLineCount(selectedArtifact) : 0),
    [selectedArtifact],
  );
  const selectedCanvasLabel = React.useMemo(() => {
    if (selectedArtifact) return `${artifactTypeLabel(selectedArtifact)} selected`;
    if (selectedMessageNode) return `${selectedMessageNode.role} branch selected`;
    return "No active focus";
  }, [selectedArtifact, selectedMessageNode]);
  const selectedCanvasPreview = React.useMemo(() => {
    if (selectedArtifact) return trimArtifactPreview(selectedArtifact);
    if (selectedPreview.length > 0) return selectedPreview;
    return "Use the canvas to branch, compare, and pin reusable context.";
  }, [selectedArtifact, selectedPreview]);
  const showCanvasPromptCta =
    !draft &&
    !selectedArtifact &&
    (!selectedMessageNode || selectedMessageNode.id === ROOT_NODE_ID);
  const attachableTargets = React.useMemo(
    () =>
      canvasConversationNodes
        .filter((node) => !node.isBridge)
        .map((node) => ({
          id: node.id,
          preview:
            node.text.replace(/\s+/g, " ").trim() ||
            (node.id === ROOT_NODE_ID ? "Conversation root" : "No preview"),
          role: node.id === ROOT_NODE_ID ? "root" : node.role,
        })),
    [canvasConversationNodes],
  );

  return {
    attachableTargets,
    selectedArtifactLineCount,
    selectedArtifactPreviewSize,
    selectedArtifactSize,
    selectedArtifactStatChips,
    selectedBranchOptions,
    selectedBranchPathLabel,
    selectedCanvasLabel,
    selectedCanvasPreview,
    selectedPreview,
    showCanvasPromptCta,
    showInspector:
      !!selectedArtifact ||
      (!!selectedFlowNode && !!selectedMessageNode) ||
      linkEditMode ||
      resetLinkCount > 0,
    selectedContextCount: selectedContextArtifacts.length,
  };
}
