import type { ThreadRepoItem } from "@/components/assistant-ui/use-thread-repo-items";
import type { ConnectorId, LinkConnectorPref, Node, Point } from "./graph-types";
import {
  HALF_NODE_HEIGHT,
  HALF_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROOT_NODE_ID,
} from "./graph-types";

const CONNECTOR_GROUP: Record<ConnectorId, "left" | "right" | "top" | "bottom"> = {
  "left-0": "left",
  "left-1": "left",
  "left-2": "left",
  "right-0": "right",
  "right-1": "right",
  "right-2": "right",
  "top-0": "top",
  "top-1": "top",
  "bottom-0": "bottom",
  "bottom-1": "bottom",
};

const CONNECTOR_POSITION_INDEX: Record<ConnectorId, number> = {
  "left-0": 0,
  "left-1": 1,
  "left-2": 2,
  "right-0": 0,
  "right-1": 1,
  "right-2": 2,
  "top-0": 0,
  "top-1": 1,
  "bottom-0": 0,
  "bottom-1": 1,
};

const CONNECTOR_COUNTS: Record<"left" | "right" | "top" | "bottom", number> = {
  left: 3,
  right: 3,
  top: 2,
  bottom: 2,
};

const CONNECTOR_OFFSET = 12;

export const ALL_CONNECTORS: ConnectorId[] = [
  "left-0",
  "left-1",
  "left-2",
  "right-0",
  "right-1",
  "right-2",
  "top-0",
  "top-1",
  "bottom-0",
  "bottom-1",
];

export function extractText(msg: ThreadRepoItem["message"]): string {
  try {
    const parts: Array<{ type?: unknown; text?: unknown }> = Array.isArray(msg?.content)
      ? (msg.content as Array<{ type?: unknown; text?: unknown }>)
      : [];
    const text = parts
      .map((part) => (part?.type === "text" && typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join(" • ");
    return text || "";
  } catch {
    return "";
  }
}

export const nodesShareBranch = (parentNode: Node | null, childNode: Node | null) => {
  if (!parentNode || !childNode) return false;
  const parentBranch = parentNode.branchId;
  const childBranch = childNode.branchId;
  if (parentBranch == null || childBranch == null) return true;
  return parentBranch === childBranch;
};

export const isConnectorId = (value: unknown): value is ConnectorId =>
  typeof value === "string" && (ALL_CONNECTORS as readonly string[]).includes(value);

export const clampZoom = (value: number) => Math.min(3, Math.max(0.3, value));

export const getEdgeKey = (parentId: string | null, childId: string) =>
  `${parentId ?? "null"}->${childId}`;

export const getConnectorPoint = (node: Node, connector: ConnectorId): Point => {
  const group = CONNECTOR_GROUP[connector];
  const order = CONNECTOR_POSITION_INDEX[connector];
  const count = CONNECTOR_COUNTS[group];
  const centerX = node.x ?? 0;
  const centerY = node.y ?? 0;
  const ratio = (order + 1) / (count + 1);
  switch (group) {
    case "left":
      return { x: centerX - HALF_NODE_WIDTH, y: centerY - HALF_NODE_HEIGHT + ratio * NODE_HEIGHT };
    case "right":
      return { x: centerX + HALF_NODE_WIDTH, y: centerY - HALF_NODE_HEIGHT + ratio * NODE_HEIGHT };
    case "top":
      return { x: centerX - HALF_NODE_WIDTH + ratio * NODE_WIDTH, y: centerY - HALF_NODE_HEIGHT };
    case "bottom":
    default:
      return { x: centerX - HALF_NODE_WIDTH + ratio * NODE_WIDTH, y: centerY + HALF_NODE_HEIGHT };
  }
};

export const offsetConnectorPoint = (
  point: Point,
  connector: ConnectorId,
  distance = CONNECTOR_OFFSET,
): Point => {
  const group = CONNECTOR_GROUP[connector];
  switch (group) {
    case "left":
      return { x: point.x - distance, y: point.y };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "top":
      return { x: point.x, y: point.y - distance };
    case "bottom":
    default:
      return { x: point.x, y: point.y + distance };
  }
};

export const isHorizontalConnector = (connector: ConnectorId) => {
  const group = CONNECTOR_GROUP[connector];
  return group === "left" || group === "right";
};

export const isVerticalConnector = (connector: ConnectorId) => {
  const group = CONNECTOR_GROUP[connector];
  return group === "top" || group === "bottom";
};

export const chooseDefaultConnectors = (
  parent: Node | undefined,
  child: Node,
): LinkConnectorPref => {
  if (parent?.id === ROOT_NODE_ID) {
    return { from: "bottom-0", to: "top-0" };
  }
  if (parent && parent.x != null && parent.y != null && child.x != null && child.y != null) {
    const dx = child.x - parent.x;
    const dy = child.y - parent.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        return { from: "right-1", to: "left-1" };
      }
      return { from: "left-1", to: "right-1" };
    }
    if (dy >= 0) {
      return { from: "bottom-0", to: "top-0" };
    }
    return { from: "top-0", to: "bottom-0" };
  }
  if (!parent) {
    return { from: "right-1", to: "left-1" };
  }
  const depthDelta = child.depth - parent.depth;
  if (depthDelta > 0) {
    return { from: "right-1", to: "left-1" };
  }
  if (depthDelta < 0) {
    return { from: "left-1", to: "right-1" };
  }
  const indexDelta = child.idx - parent.idx;
  if (indexDelta >= 0) {
    return { from: "bottom-0", to: "top-0" };
  }
  return { from: "top-0", to: "bottom-0" };
};
