import { MarkerType } from "@xyflow/react";
import {
  getEdgeKey,
  nodesShareBranch,
} from "@/components/assistant-ui/thread-graph/graph-geometry";
import { ROOT_NODE_ID } from "@/components/assistant-ui/thread-graph/graph-types";
import {
  artifactAccent,
  CANVAS_PROMPT_DRAFT_NODE_ID,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type {
  CanvasFlowElementsParams,
} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements-types";
import type { CanvasModelVisual } from "@/components/assistant-ui/thread-graph-flow/canvas-flow-nodes";
import type { ThreadGraphFlowEdge } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

export function buildConversationFlowEdges({
  canvasConversationNodes,
  handleCutEdge,
  linkEditMode,
  nodeIndex,
  resolveModelVisual,
}: Pick<
  CanvasFlowElementsParams,
  "canvasConversationNodes" | "handleCutEdge" | "linkEditMode" | "nodeIndex"
> & {
  resolveModelVisual: (node: {
    model?: string | null;
    provider?: string | null;
  }) => CanvasModelVisual;
}): ThreadGraphFlowEdge[] {
  const edges: ThreadGraphFlowEdge[] = [];
  for (const node of canvasConversationNodes) {
    if (node.parentId === null) continue;

    const parentNode = nodeIndex.get(node.parentId) ?? null;
    const isEditable = parentNode
      ? parentNode.id !== ROOT_NODE_ID && nodesShareBranch(parentNode, node)
      : false;
    const visual = resolveModelVisual(node);
    edges.push({
      id: getEdgeKey(node.parentId, node.id),
      source: node.parentId,
      target: node.id,
      type: "threadEdge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: visual.accent,
        width: 18,
        height: 18,
      },
      selectable: false,
      data: {
        accent: visual.accent,
        editable: isEditable,
        emphasis: "normal",
        isBridge: Boolean(node.isBridge),
        isEdited: Boolean(node.editedFromId),
        label: node.isBridge ? "bridge" : node.editedFromId ? "edited" : undefined,
        linkEditMode,
        onCut: isEditable ? () => handleCutEdge(node.id, node.parentId) : undefined,
        tone: node.isBridge ? "bridge" : node.editedFromId ? "edited" : "default",
      },
    });
  }
  return edges;
}

export function buildContextFlowEdges({
  artifactIndex,
  contextLinks,
  nodeIndex,
  promptIndex,
}: Pick<
  CanvasFlowElementsParams,
  "artifactIndex" | "contextLinks" | "nodeIndex" | "promptIndex"
>): ThreadGraphFlowEdge[] {
  const edges: ThreadGraphFlowEdge[] = [];
  for (const link of contextLinks) {
    const artifact = artifactIndex.get(link.artifactId);
    const targetId = link.targetMessageId;
    const targetExists = nodeIndex.has(targetId) || promptIndex.has(targetId);
    if (!artifact || !targetExists) continue;

    const accent = artifactAccent(artifact);
    edges.push({
      id: `context:${link.artifactId}->${targetId}`,
      source: link.artifactId,
      target: targetId,
      type: "threadEdge",
      selectable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: accent,
        width: 16,
        height: 16,
      },
      data: {
        accent,
        emphasis: "normal",
        label: "context",
        tone: "context",
      },
    });
  }
  return edges;
}

export function buildOutputFlowEdges({
  artifactIndex,
  canvasLinks,
  nodeIndex,
  promptIndex,
}: Pick<
  CanvasFlowElementsParams,
  "artifactIndex" | "canvasLinks" | "nodeIndex" | "promptIndex"
>): ThreadGraphFlowEdge[] {
  const edges: ThreadGraphFlowEdge[] = [];
  for (const link of canvasLinks) {
    if (link.relation !== "output") continue;

    const artifact = artifactIndex.get(link.artifactId);
    const sourceId =
      link.promptId && promptIndex.has(link.promptId)
        ? link.promptId
        : link.responseId ?? link.promptId;
    if (!artifact || !sourceId) continue;

    const sourceExists =
      sourceId === CANVAS_PROMPT_DRAFT_NODE_ID ||
      nodeIndex.has(sourceId) ||
      promptIndex.has(sourceId);
    if (!sourceExists) continue;

    const pending = !link.responseId;
    const accent = artifactAccent(artifact);
    edges.push({
      id: `output:${sourceId}->${link.artifactId}`,
      source: sourceId,
      target: link.artifactId,
      type: "threadEdge",
      selectable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: accent,
        width: 16,
        height: 16,
      },
      data: {
        accent,
        emphasis: "normal",
        label: pending ? "pending output" : "output",
        tone: pending ? "pending-output" : "output",
      },
    });
  }
  return edges;
}

export function buildDraftFlowEdges({
  draftBranchSpec,
  nodeIndex,
}: Pick<CanvasFlowElementsParams, "draftBranchSpec" | "nodeIndex">): ThreadGraphFlowEdge[] {
  if (!draftBranchSpec) return [];
  const sourceId = draftBranchSpec.parentId ?? ROOT_NODE_ID;
  if (!nodeIndex.has(sourceId)) return [];

  return [
    {
      id: `draft:${sourceId}->${CANVAS_PROMPT_DRAFT_NODE_ID}`,
      source: sourceId,
      target: CANVAS_PROMPT_DRAFT_NODE_ID,
      type: "threadEdge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#0f766e",
        width: 18,
        height: 18,
      },
      selectable: false,
      data: {
        accent: "#0f766e",
        emphasis: "normal",
        label: "draft",
        tone: "draft",
      },
    },
  ];
}
