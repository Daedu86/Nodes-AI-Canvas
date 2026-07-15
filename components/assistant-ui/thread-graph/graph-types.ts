export type Node = {
  id: string;
  parentId: string | null;
  role: string;
  text: string;
  depth: number;
  idx: number;
  x?: number;
  y?: number;
  branchId?: unknown;
  editedFromId?: string | null;
  isBridge?: boolean;
  model?: string | null;
  provider?: string | null;
  contextScope?: "parent" | "branch" | "tree" | null;
};

export type ConnectorId =
  | "left-0"
  | "left-1"
  | "left-2"
  | "right-0"
  | "right-1"
  | "right-2"
  | "top-0"
  | "top-1"
  | "bottom-0"
  | "bottom-1";

export type LinkConnectorPref = {
  from: ConnectorId;
  to: ConnectorId;
};

export type ConnectorRole = "from" | "to";

export type Point = { x: number; y: number };

export type EdgeConnectorInfo = {
  from: ConnectorId;
  to: ConnectorId;
  points: { from: Point; to: Point };
  parentId: string | null;
  childId: string;
};

export type NodePosition = { x: number; y: number };

export const ROOT_NODE_ID = "__ROOT__";
export const ROOT_NODE_LABEL = "Conversation Root";
export const CONNECTOR_HIT_RADIUS = 14;
export const ZOOM_STEP = 1.2;
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 56;
export const HALF_NODE_WIDTH = NODE_WIDTH / 2;
export const HALF_NODE_HEIGHT = NODE_HEIGHT / 2;
export const POS_KEY = "a-ui.graph-inline-pos.v1";
export const CONN_KEY = "a-ui.graph-inline-conn.v1";
