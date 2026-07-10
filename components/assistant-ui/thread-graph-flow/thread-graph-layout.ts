"use client";

import dagre from "dagre";
import { Position } from "@xyflow/react";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const ROOT_NODE_SIZE = { width: 320, height: 172 };
const MESSAGE_NODE_SIZE = { width: 360, height: 236 };
const PROMPT_DRAFT_NODE_SIZE = { width: 400, height: 300 };
const ARTIFACT_NODE_SIZE = { width: 320, height: 228 };
const ARTIFACT_LANE_X = -420;
const ARTIFACT_START_Y = 60;
const ARTIFACT_GAP_Y = 272;

const getNodeSize = (node: ThreadGraphFlowNode) => {
  const kind = node.data?.kind;
  if (kind === "root") return { ...ROOT_NODE_SIZE };
  if (kind === "artifact") return { ...ARTIFACT_NODE_SIZE };
  if (kind === "prompt-draft") return { ...PROMPT_DRAFT_NODE_SIZE };
  return { ...MESSAGE_NODE_SIZE };
};

export const layoutThreadGraphFlow = (
  sourceNodes: ThreadGraphFlowNode[],
  sourceEdges: ThreadGraphFlowEdge[],
) => {
  const conversationNodes = sourceNodes.filter((node) => node.data.kind !== "artifact");
  const artifactNodes = sourceNodes.filter((node) => node.data.kind === "artifact");
  const treeEdges = sourceEdges.filter((edge) => edge.data?.tone !== "context");
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 150,
    nodesep: 104,
    marginx: 48,
    marginy: 48,
  });

  conversationNodes.forEach((node) => {
    const size = getNodeSize(node);
    graph.setNode(node.id, size);
  });

  treeEdges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const laidOutConversationNodes = conversationNodes.map((node) => {
    const size = getNodeSize(node);
    const position = graph.node(node.id) as { x: number; y: number } | undefined;

    return {
      ...node,
      draggable: false,
      position: position
        ? { x: position.x - size.width / 2, y: position.y - size.height / 2 }
        : node.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    } satisfies ThreadGraphFlowNode;
  });

  const laidOutArtifactNodes = artifactNodes.map((node, index) => {
    const size = getNodeSize(node);
    const storedPosition = node.data.position;
    const fallbackPosition = {
      x: ARTIFACT_LANE_X,
      y: ARTIFACT_START_Y + index * ARTIFACT_GAP_Y,
    };

    return {
      ...node,
      draggable: true,
      position: storedPosition ?? fallbackPosition,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        width: size.width,
      },
    } satisfies ThreadGraphFlowNode;
  });

  return { nodes: [...laidOutConversationNodes, ...laidOutArtifactNodes], edges: sourceEdges };
};
