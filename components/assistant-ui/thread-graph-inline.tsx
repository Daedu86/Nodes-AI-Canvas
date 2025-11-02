"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import { Copy as CopyIcon, RefreshCw, RotateCcw, Scissors, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";
import { useThreadRepoItems, type ThreadRepoItem } from "./use-thread-repo-items";
import { ASSISTANT_EDIT_METADATA_KEY } from "@/lib/assistant-edit-branching";
import { useLinkEditor } from "@/components/context/link-editor";

function extractText(msg: ThreadRepoItem["message"]): string {
  try {
    const parts = Array.isArray(msg?.content) ? msg.content : [];
    const text = parts
      .map((p) => (p?.type === "text" && typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join(" • ");
    return text || "";
  } catch {
    return "";
  }
}

type Node = {
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
};

const ROOT_NODE_ID = "__ROOT__";
const ROOT_NODE_LABEL = "Conversation Root";

const nodesShareBranch = (parentNode: Node | null, childNode: Node | null) => {
  if (!parentNode || !childNode) return false;
  const parentBranch = parentNode.branchId;
  const childBranch = childNode.branchId;
  if (parentBranch == null || childBranch == null) return true;
  return parentBranch === childBranch;
};

type ConnectorId =
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

type LinkConnectorPref = {
  from: ConnectorId;
  to: ConnectorId;
};

type ConnectorRole = "from" | "to";

type Point = { x: number; y: number };

type EdgeConnectorInfo = {
  from: ConnectorId;
  to: ConnectorId;
  points: { from: Point; to: Point };
  parentId: string | null;
  childId: string;
};

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

const ALL_CONNECTORS: ConnectorId[] = [
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

const CONNECTOR_OFFSET = 12;
const CONNECTOR_HIT_RADIUS = 14;

const isConnectorId = (value: unknown): value is ConnectorId =>
  typeof value === "string" && (ALL_CONNECTORS as readonly string[]).includes(value);

const ZOOM_STEP = 1.2;
const clampZoom = (value: number) => Math.min(3, Math.max(0.3, value));
const NODE_WIDTH = 220;
const NODE_HEIGHT = 56;
const HALF_NODE_WIDTH = NODE_WIDTH / 2;
const HALF_NODE_HEIGHT = NODE_HEIGHT / 2;

const getConnectorPoint = (node: Node, connector: ConnectorId): Point => {
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

const offsetConnectorPoint = (point: Point, connector: ConnectorId, distance = CONNECTOR_OFFSET): Point => {
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

const isHorizontalConnector = (connector: ConnectorId) => {
  const group = CONNECTOR_GROUP[connector];
  return group === "left" || group === "right";
};

const isVerticalConnector = (connector: ConnectorId) => {
  const group = CONNECTOR_GROUP[connector];
  return group === "top" || group === "bottom";
};

export function ThreadGraphInline() {
  const runtime = useAssistantRuntime();
  const repoItems = useThreadRepoItems(runtime);
  const { getParentId, cutLink, restoreLink, resetLinks, overrides } = useLinkEditor();
  const [linkEditMode, setLinkEditMode] = React.useState(false);

  const nodes: Node[] = React.useMemo(() => {
    const arr = Array.isArray(repoItems) ? repoItems : [];
    const map = new Map<string, ThreadRepoItem>();
    arr.forEach((it) => map.set(it.message?.id, it));
    const depthCache = new Map<string, number>();
    const getDepth = (m: ThreadRepoItem["message"]): number => {
      const id = m?.id;
      if (!id) return 0;
      if (depthCache.has(id)) return depthCache.get(id)!;
      let d = 0;
      let cur = m;
      const guard = new Set<string>();
      while (true) {
        const parentId = map.get(cur?.id)?.parentId ?? undefined;
        if (!parentId || !map.has(parentId) || guard.has(parentId)) break;
        d += 1;
        guard.add(parentId);
        cur = map.get(parentId)!.message;
      }
      depthCache.set(id, d);
      return d;
    };
    const baseNodes = arr.map((it: ThreadRepoItem, i: number) => {
      const id = String(it.message?.id ?? i);
      const parentId = it.parentId ?? null;
      const message = it.message;
      const branchId =
        message && typeof message === "object" && "branchId" in message
          ? (message as { branchId?: unknown }).branchId
          : undefined;
      const metadataCustom =
        (message && typeof message === "object" && "metadata" in message
          ? ((message as { metadata?: { custom?: Record<string, unknown> } }).metadata?.custom ?? {})
          : {}) as Record<string, unknown>;
      const editedFromValue = metadataCustom[ASSISTANT_EDIT_METADATA_KEY];
      const editedFromId = typeof editedFromValue === "string" ? editedFromValue : null;
      const node: Node = {
        id,
        parentId,
        role: String(it.message?.role ?? ""),
        text: extractText(it.message).slice(0, 100),
        depth: 0,
        idx: i,
        branchId,
        editedFromId,
      };
      const effectiveParent = getParentId(id, parentId);
      node.parentId = effectiveParent;
      node.depth = effectiveParent === null ? 0 : getDepth(it.message);
      return node;
    });
    if (baseNodes.length === 0) return baseNodes;
    const rootChildren = baseNodes.filter((node) => node.parentId === null);
    if (rootChildren.length === 0) return baseNodes;
    rootChildren.forEach((node) => {
      node.parentId = ROOT_NODE_ID;
      node.depth += 1;
    });
    const rootNode: Node = {
      id: ROOT_NODE_ID,
      parentId: null,
      role: "ROOT",
      text: ROOT_NODE_LABEL,
      depth: 0,
      idx: -1,
      branchId: null,
    };
    return [rootNode, ...baseNodes];
  }, [repoItems, getParentId]);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const viewStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const nodeDragRef = React.useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [nodePositions, setNodePositions] = React.useState<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const [linkConnectors, setLinkConnectors] = React.useState<Map<string, LinkConnectorPref>>(new Map());
  const connectorDefaultsRef = React.useRef(new Map<string, LinkConnectorPref>());
  const connectorPositionsRef = React.useRef(new Map<string, Map<ConnectorId, Point>>());
  const edgeConnectorMapRef = React.useRef(new Map<string, EdgeConnectorInfo>());
  const nodeLayoutRef = React.useRef(new Map<string, Node>());
  const variantLogRef = React.useRef(new Set<string>());
  const cutTargetsRef = React.useRef(
    new Map<string, { x: number; y: number; parentId: string | null; childId: string }>(),
  );
  const restoreTargetsRef = React.useRef(
    new Map<string, { x: number; y: number; radius: number; childId: string }>(),
  );
  const [hoveredConnector, setHoveredConnector] = React.useState<{ nodeId: string; connectorId: ConnectorId } | null>(
    null
  );
  const [draggingConnector, setDraggingConnector] = React.useState<{ nodeId: string; connectorId: ConnectorId } | null>(
    null
  );
  const hoveredConnectorRef = React.useRef<typeof hoveredConnector>(null);
  const draggingConnectorRef = React.useRef<typeof draggingConnector>(null);
  const connectorDragRef = React.useRef<{
    nodeId: string;
    connectorId: ConnectorId;
    edgeKey: string;
    role: ConnectorRole;
    parentId: string | null;
    childId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef(false);

  React.useEffect(() => {
    hoveredConnectorRef.current = hoveredConnector;
  }, [hoveredConnector]);

  React.useEffect(() => {
    draggingConnectorRef.current = draggingConnector;
  }, [draggingConnector]);

  const POS_KEY = "a-ui.graph-inline-pos.v1";
  const CONN_KEY = "a-ui.graph-inline-conn.v1";
  const boundsRef = React.useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const updateHoveredConnector = React.useCallback(
    (next: { nodeId: string; connectorId: ConnectorId } | null) => {
      setHoveredConnector((prev) => {
        if (prev?.nodeId === next?.nodeId && prev?.connectorId === next?.connectorId) {
          return prev;
        }
        return next;
      });
    },
    []
  );
  const updateDraggingConnector = React.useCallback(
    (next: { nodeId: string; connectorId: ConnectorId } | null) => {
      setDraggingConnector((prev) => {
        if (prev?.nodeId === next?.nodeId && prev?.connectorId === next?.connectorId) {
          return prev;
        }
        return next;
      });
    },
    []
  );
  const screenToWorld = React.useCallback(
    (sx: number, sy: number, currentView = view) => ({
      x: (sx - currentView.x) / currentView.k,
      y: (sy - currentView.y) / currentView.k,
    }),
    [view]
  );

  const getEdgeKey = React.useCallback(
    (parentId: string | null, childId: string) => `${parentId ?? "null"}->${childId}`,
    []
  );

  const getNodesForEdge = React.useCallback(
    (parentId: string | null, childId: string) => {
      if (!childId) {
        return { parentNode: null, childNode: null };
      }
      const parentNode = parentId ? nodeLayoutRef.current.get(parentId) ?? null : null;
      const childNode = nodeLayoutRef.current.get(childId) ?? null;
      return { parentNode, childNode };
    },
    []
  );

  const isConfigurableEdge = React.useCallback(
    (parentId: string | null, childId: string) => {
      const { parentNode, childNode } = getNodesForEdge(parentId, childId);
      if (!parentNode || !childNode) return false;
      return nodesShareBranch(parentNode, childNode);
    },
    [getNodesForEdge]
  );

  const chooseDefaultConnectors = React.useCallback(
    (parent: Node | undefined, child: Node): LinkConnectorPref => {
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
    },
    []
  );

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(CONN_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { from?: string; to?: string }>;
      const map = new Map<string, LinkConnectorPref>();
      (Object.entries(parsed) as Array<[string, { from?: string; to?: string }]>)
        .forEach(([key, value]) => {
          const from = value?.from;
          const to = value?.to;
          if (isConnectorId(from) && isConnectorId(to)) {
            map.set(key, { from, to });
          }
        });
      if (map.size > 0) setLinkConnectors(map);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      if (linkConnectors.size === 0) {
        localStorage.removeItem(CONN_KEY);
        return;
      }
      const obj: Record<string, LinkConnectorPref> = {};
      linkConnectors.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(CONN_KEY, JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }, [linkConnectors]);

  React.useEffect(() => {
    const defaults = new Map<string, LinkConnectorPref>();
    const idToNode = new Map<string, Node>();
    nodes.forEach((node) => {
      idToNode.set(node.id, node);
    });
    nodes.forEach((node) => {
      if (!node.parentId) return;
      const parent = idToNode.get(node.parentId);
      defaults.set(getEdgeKey(node.parentId, node.id), chooseDefaultConnectors(parent, node));
    });
    connectorDefaultsRef.current = defaults;
  }, [chooseDefaultConnectors, getEdgeKey, nodes]);

  const getConnectorHit = React.useCallback(
    (x: number, y: number, radius = CONNECTOR_HIT_RADIUS) => {
      let closest: { nodeId: string; connectorId: ConnectorId; distance: number } | null = null;
      connectorPositionsRef.current.forEach((connectorMap, nodeId) => {
        connectorMap.forEach((point, connectorId) => {
          const dx = point.x - x;
          const dy = point.y - y;
          const distance = Math.hypot(dx, dy);
          if (distance <= radius && (closest == null || distance < closest.distance)) {
            closest = { nodeId, connectorId, distance };
          }
        });
      });
      return closest;
    },
    []
  );

  const findEdgeForConnector = React.useCallback(
    (nodeId: string, connectorId: ConnectorId, point?: Point) => {
      let best:
        | {
            edgeKey: string;
            role: ConnectorRole;
            parentId: string | null;
            childId: string;
            distance: number;
          }
        | null = null;
      edgeConnectorMapRef.current.forEach((info, edgeKey) => {
        if (!isConfigurableEdge(info.parentId, info.childId)) {
          return;
        }
        if (info.parentId === nodeId && info.from === connectorId) {
          const targetPoint = info.points.to;
          const distance = point ? Math.hypot(targetPoint.x - point.x, targetPoint.y - point.y) : 0;
          if (best == null || distance < best.distance) {
            best = { edgeKey, role: "from", parentId: info.parentId, childId: info.childId, distance };
          }
        }
        if (info.childId === nodeId && info.to === connectorId) {
          const targetPoint = info.points.from;
          const distance = point ? Math.hypot(targetPoint.x - point.x, targetPoint.y - point.y) : 0;
          if (best == null || distance < best.distance) {
            best = { edgeKey, role: "to", parentId: info.parentId, childId: info.childId, distance };
          }
        }
      });
      return best;
    },
    [isConfigurableEdge]
  );

  const isValidConnectorTarget = React.useCallback(
    (
      dragContext:
        | { parentId: string | null; childId: string; role: ConnectorRole }
        | null,
      candidate: { nodeId: string; connectorId: ConnectorId } | null
    ) => {
      if (!dragContext || !candidate) return false;
      if (!dragContext.childId) return false;
      if (dragContext.role === "from") {
        if (!dragContext.parentId || candidate.nodeId !== dragContext.parentId) return false;
      } else if (candidate.nodeId !== dragContext.childId) {
        return false;
      }
      if (!isConfigurableEdge(dragContext.parentId ?? null, dragContext.childId)) {
        return false;
      }
      return true;
    },
    [isConfigurableEdge]
  );

  const applyConnectorSelection = React.useCallback(
    (
      edgeKey: string,
      role: ConnectorRole,
      connectorId: ConnectorId,
      parentId: string | null,
      childId: string
    ) => {
      if (!childId) return;
      setLinkConnectors((prev) => {
        if (!isConfigurableEdge(parentId, childId)) {
          if (!prev.has(edgeKey)) return prev;
          const next = new Map(prev);
          next.delete(edgeKey);
          return next;
        }
        const defaults = connectorDefaultsRef.current;
        const defaultPref = defaults.get(edgeKey);
        const stored = prev.get(edgeKey);
        const fallback = edgeConnectorMapRef.current.get(edgeKey);
        const base = stored ?? defaultPref ?? (fallback ? { from: fallback.from, to: fallback.to } : null);
        if (!base) return prev;
        const updated: LinkConnectorPref =
          role === "from" ? { from: connectorId, to: base.to } : { from: base.from, to: connectorId };
        if (stored && stored.from === updated.from && stored.to === updated.to) {
          return prev;
        }
        const matchesDefault =
          !!defaultPref && defaultPref.from === updated.from && defaultPref.to === updated.to;
        if (matchesDefault) {
          if (!stored) return prev;
          const next = new Map(prev);
          next.delete(edgeKey);
          return next;
        }
        const next = new Map(prev);
        next.set(edgeKey, updated);
        return next;
      });
    },
    [isConfigurableEdge]
  );

  React.useEffect(() => {
    setLinkConnectors((prev) => {
      if (prev.size === 0) return prev;
      const defaults = connectorDefaultsRef.current;
      let changed = false;
      const next = new Map<string, LinkConnectorPref>();
      const idToNode = new Map(nodes.map((node) => [node.id, node] as const));
      prev.forEach((value, key) => {
        if (!defaults.has(key)) {
          changed = true;
          return;
        }
        const [rawParent, rawChild] = key.split("->");
        const parentId = rawParent === "null" ? null : rawParent ?? null;
        const childId = rawChild ?? "";
        const parentNode = parentId ? idToNode.get(parentId) ?? null : null;
        const childNode = idToNode.get(childId) ?? null;
        if (!parentNode || !childNode || !nodesShareBranch(parentNode, childNode)) {
          changed = true;
          return;
        }
        next.set(key, value);
      });
      return changed ? next : prev;
    });
  }, [nodes]);

  const render = React.useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);

    const bgColor = getComputedStyle(document.body).backgroundColor || "#fff";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";

    const isDarkBg = (() => {
      const numeric = bgColor.match(/\d+/g);
      if (!numeric || numeric.length < 3) return false;
      const [r, g, b] = numeric.slice(0, 3).map(Number);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luminance < 140;
    })();
    const nodeFill = isDarkBg ? "rgba(30,41,59,0.92)" : "rgba(255,255,255,0.94)";
    const nodeStroke = isDarkBg ? "rgba(148,163,184,0.35)" : "rgba(15,23,42,0.08)";
    const textColor = isDarkBg ? "rgba(226,232,240,0.95)" : "#111827";
    const labelColor = isDarkBg ? "rgba(148,163,184,0.85)" : "rgba(100,116,139,0.95)";

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);
    boundsRef.current.clear();

    const maxDepth = nodes.reduce((a, n) => Math.max(a, n.depth), 0);
    const levels: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((n) => levels[n.depth].push(n));
    const marginX = 80;
    const marginY = 40;
    const xStep = 280;
    const levelYSteps = levels.map(() => 80);
    levels.forEach((level, depth) => {
      const stepY = levelYSteps[depth] || 60;
      level.forEach((n, index) => {
        const x = marginX + depth * xStep + HALF_NODE_WIDTH;
        const y = marginY + (index + 1) * stepY;
        n.x = x;
        n.y = y;
        const pos = nodePositions.get(n.id);
        if (pos) {
          n.x = pos.x;
          n.y = pos.y;
        }
      });
    });

    const idToNode = new Map(nodes.map((n) => [n.id, n] as const));
    nodeLayoutRef.current = new Map(idToNode);
    const connectorUsage = new Map<string, Set<ConnectorId>>();
    const connectorPositions = new Map<string, Map<ConnectorId, Point>>();
    const edgeConnectorMap = new Map<string, EdgeConnectorInfo>();
    cutTargetsRef.current.clear();
    restoreTargetsRef.current.clear();

    nodes.forEach((n) => {
      if (!n.parentId) return;
      if (n.parentId === ROOT_NODE_ID) return;
      if (n.editedFromId) {
        if (
          process.env.NODE_ENV !== "production" &&
          !variantLogRef.current.has(n.id)
        ) {
          console.log("[thread-graph-inline] suppressing variant edge", {
            childId: n.id,
            parentId: n.parentId,
            editedFromId: n.editedFromId,
          });
          variantLogRef.current.add(n.id);
        }
        return;
      }
      const parent = idToNode.get(String(n.parentId));
      if (!parent || parent.x == null || parent.y == null || n.x == null || n.y == null) return;
      const edgeKey = getEdgeKey(n.parentId, n.id);
      const pref = linkConnectors.get(edgeKey) ?? chooseDefaultConnectors(parent, n);
      const parentConnectorPoint = getConnectorPoint(parent, pref.from);
      const childConnectorPoint = getConnectorPoint(n, pref.to);
      edgeConnectorMap.set(edgeKey, {
        from: pref.from,
        to: pref.to,
        points: { from: parentConnectorPoint, to: childConnectorPoint },
        parentId: parent.id,
        childId: n.id,
      });

      const start = offsetConnectorPoint(parentConnectorPoint, pref.from);
      const end = offsetConnectorPoint(childConnectorPoint, pref.to);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (isHorizontalConnector(pref.from) && isHorizontalConnector(pref.to)) {
        const midX = (start.x + end.x) / 2;
        ctx.lineTo(midX, start.y);
        ctx.lineTo(midX, end.y);
      } else if (isVerticalConnector(pref.from) && isVerticalConnector(pref.to)) {
        const midY = (start.y + end.y) / 2;
        ctx.lineTo(start.x, midY);
        ctx.lineTo(end.x, midY);
      } else if (isHorizontalConnector(pref.from) && isVerticalConnector(pref.to)) {
        ctx.lineTo(end.x, start.y);
      } else if (isVerticalConnector(pref.from) && isHorizontalConnector(pref.to)) {
        ctx.lineTo(start.x, end.y);
      }
      ctx.lineTo(end.x, end.y);
      const hue = n.branchId ? (String(n.branchId).length * 67) % 360 : null;
      ctx.strokeStyle = hue == null ? "rgba(100,100,100,0.7)" : `hsla(${hue},60%,45%,0.75)`;
      ctx.lineWidth = hue == null ? 1.6 : 1.2;
      ctx.stroke();
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const label = n.id;
      if (label) {
        ctx.font = "9px ui-monospace, monospace";
        const metrics = ctx.measureText(label);
        const textWidth = metrics.width;
        const textHeight = 9;
        const paddingX = 4;
        const paddingY = 2;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = textHeight + paddingY * 2;
        const boxX = midX - boxWidth / 2;
        const boxY = midY - boxHeight / 2;
        ctx.beginPath();
        const boxRadius = 4;
        ctx.moveTo(boxX + boxRadius, boxY);
        ctx.lineTo(boxX + boxWidth - boxRadius, boxY);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + boxRadius);
        ctx.lineTo(boxX + boxWidth, boxY + boxHeight - boxRadius);
        ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - boxRadius, boxY + boxHeight);
        ctx.lineTo(boxX + boxRadius, boxY + boxHeight);
        ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - boxRadius);
        ctx.lineTo(boxX, boxY + boxRadius);
        ctx.quadraticCurveTo(boxX, boxY, boxX + boxRadius, boxY);
        ctx.closePath();
        ctx.fillStyle = isDarkBg ? "rgba(15,23,42,0.9)" : "rgba(241,245,249,0.95)";
        ctx.strokeStyle = isDarkBg ? "rgba(148,163,184,0.5)" : "rgba(15,23,42,0.2)";
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isDarkBg ? "rgba(226,232,240,0.95)" : "#0f172a";
        ctx.textBaseline = "middle";
        ctx.fillText(label, midX - textWidth / 2, midY + 0.5);
      }
      cutTargetsRef.current.set(edgeKey, { x: midX, y: midY, parentId: parent.id, childId: n.id });
      if (linkEditMode) {
        ctx.save();
        ctx.font = "16px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(220,38,38,0.95)";
        ctx.fillText("✂", midX, midY);
        ctx.restore();
      }

      const parentUsed = connectorUsage.get(parent.id) ?? new Set<ConnectorId>();
      parentUsed.add(pref.from);
      connectorUsage.set(parent.id, parentUsed);
      const childUsed = connectorUsage.get(n.id) ?? new Set<ConnectorId>();
      childUsed.add(pref.to);
      connectorUsage.set(n.id, childUsed);
    });

    const siblingsByParent = new Map<string | null, Node[]>();
    nodes.forEach((node) => {
      const key = node.parentId ?? null;
      const collection = siblingsByParent.get(key) ?? [];
      collection.push(node);
      siblingsByParent.set(key, collection);
    });
    siblingsByParent.forEach((siblings) => {
      if (siblings.length <= 1) return;
      const sorted = [...siblings].sort((a, b) => a.idx - b.idx);
      sorted.forEach((nodeA, idx) => {
        const nodeB = sorted[idx + 1];
        if (!nodeB) return;
        if (nodeA.x == null || nodeA.y == null || nodeB.x == null || nodeB.y == null) return;
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = "rgba(239,68,68,0.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        ctx.lineTo(nodeB.x, nodeB.y);
        ctx.stroke();
        ctx.restore();

        const labelSource = nodeB.branchId ?? nodeB.id;
        if (labelSource != null) {
          const rawLabel =
            typeof labelSource === "string" || typeof labelSource === "number"
              ? String(labelSource)
              : typeof (labelSource as { id?: unknown })?.id === "string"
                ? String((labelSource as { id?: string }).id)
                : "";
          if (rawLabel) {
            const midX = (nodeA.x + nodeB.x) / 2;
            const midY = (nodeA.y + nodeB.y) / 2;
            const labelText =
              rawLabel.length > 18 ? `${rawLabel.slice(0, 8)}...${rawLabel.slice(-4)}` : rawLabel;
            ctx.save();
            ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
            const metrics = ctx.measureText(labelText);
            const paddingX = 6;
            const paddingY = 3;
            const textHeight =
              (metrics.actualBoundingBoxAscent ?? 7) + (metrics.actualBoundingBoxDescent ?? 3);
            const boxWidth = metrics.width + paddingX * 2;
            const boxHeight = textHeight + paddingY * 2;
            const boxX = midX - boxWidth / 2;
            const boxY = midY - boxHeight / 2;
            const radius = 6;
            ctx.beginPath();
            ctx.moveTo(boxX + radius, boxY);
            ctx.lineTo(boxX + boxWidth - radius, boxY);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
            ctx.lineTo(boxX + radius, boxY + boxHeight);
            ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
            ctx.lineTo(boxX, boxY + radius);
            ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
            ctx.closePath();
            ctx.fillStyle = isDarkBg ? "rgba(254,226,226,0.92)" : "rgba(254,242,242,0.95)";
            ctx.strokeStyle = "rgba(220,38,38,0.85)";
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = isDarkBg ? "#7f1d1d" : "#991b1b";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(labelText, midX, midY + 0.4);
            ctx.restore();
          }
        }
      });
    });

    nodes.forEach((n) => {
      if (n.x == null || n.y == null) return;
      const w = NODE_WIDTH;
      const h = NODE_HEIGHT;
      const x = n.x - HALF_NODE_WIDTH;
      const y = n.y - HALF_NODE_HEIGHT;
      const radius = 10;
      const isRootNode = n.id === ROOT_NODE_ID;
      const currentFill = isRootNode
        ? isDarkBg
          ? "rgba(30,64,175,0.85)"
          : "rgba(219,234,254,0.95)"
        : nodeFill;
      const currentStroke = isRootNode
        ? isDarkBg
          ? "rgba(191,219,254,0.7)"
          : "rgba(37,99,235,0.45)"
        : nodeStroke;

      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fillStyle = currentFill;
      ctx.fill();
      ctx.strokeStyle = currentStroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      const role = isRootNode ? "ROOT" : (n.role || "").toUpperCase();
      if (role) {
        ctx.fillText(role, x + 8, y + 16);
      }

      ctx.fillStyle = textColor;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      const preview = isRootNode
        ? ROOT_NODE_LABEL
        : (n.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const textY = y + 36;
      if (preview) {
        ctx.fillText(preview, x + 8, textY, w - 16);
      }
      if (linkEditMode && !isRootNode && overrides.has(n.id)) {
        const iconX = (n.x ?? 0) + HALF_NODE_WIDTH - 18;
        const iconY = (n.y ?? 0) - HALF_NODE_HEIGHT + 18;
        const radius = 12;
        restoreTargetsRef.current.set(n.id, { x: iconX, y: iconY, radius, childId: n.id });
        ctx.save();
        ctx.fillStyle = "rgba(37,99,235,0.9)";
        ctx.beginPath();
        ctx.arc(iconX, iconY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "12px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↺", iconX, iconY + 1);
        ctx.restore();
      }

      const connectorMap = new Map<ConnectorId, Point>();
      connectorPositions.set(n.id, connectorMap);
      const usedConnectors = connectorUsage.get(n.id);
      ALL_CONNECTORS.forEach((connectorId) => {
        const point = getConnectorPoint(n, connectorId);
        connectorMap.set(connectorId, point);
        const isUsed = usedConnectors?.has(connectorId) ?? false;
        const isHovered =
          hoveredConnector?.nodeId === n.id && hoveredConnector.connectorId === connectorId;
        const isDragging =
          draggingConnector?.nodeId === n.id && draggingConnector.connectorId === connectorId;
        const connectorRadius = isDragging ? 4.4 : isHovered ? 3.9 : isUsed ? 3.4 : 2.4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, connectorRadius, 0, Math.PI * 2);
        let fill = isUsed ? "#2563eb" : isDarkBg ? "rgba(148,163,184,0.55)" : "rgba(156,163,175,0.6)";
        let stroke = isDarkBg ? "rgba(17,24,39,0.85)" : "#f9fafb";
        let lineWidth = isUsed ? 1.2 : 0.8;
        if (isHovered) {
          fill = "#1d4ed8";
          stroke = isDarkBg ? "#e2e8f0" : "#bfdbfe";
          lineWidth = Math.max(lineWidth, 1.4);
        }
        if (isDragging) {
          fill = "#1e40af";
          stroke = isDarkBg ? "#f1f5f9" : "#bfdbfe";
          lineWidth = Math.max(lineWidth, 1.6);
        }
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.fill();
        ctx.stroke();
      });

      boundsRef.current.set(n.id, { x, y, w, h });
    });

    connectorPositionsRef.current = connectorPositions;
    edgeConnectorMapRef.current = edgeConnectorMap;

    ctx.restore();
  }, [chooseDefaultConnectors, draggingConnector, getEdgeKey, hoveredConnector, linkConnectors, nodePositions, nodes, view, linkEditMode, overrides]);

  const resetView = React.useCallback(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const maxDepth = nodes.reduce((acc, node) => Math.max(acc, node.depth), 0);
    const levels: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((node) => levels[node.depth].push(node));
    const marginX = 80;
    const marginY = 40;
    const xStep = maxDepth > 0 ? (width - marginX * 2) / maxDepth : width - marginX * 2;
    const levelYSteps = levels.map((level) => {
      const count = level.length || 1;
      return count > 0 ? (height - marginY * 2) / count : height;
    });
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    levels.forEach((level, depth) => {
      const stepY = levelYSteps[depth] || 60;
      level.forEach((node, index) => {
        const x = marginX + depth * xStep + HALF_NODE_WIDTH;
        const y = marginY + (index + 1) * stepY;
        minX = Math.min(minX, x - HALF_NODE_WIDTH);
        maxX = Math.max(maxX, x + HALF_NODE_WIDTH);
        minY = Math.min(minY, y - HALF_NODE_HEIGHT);
        maxY = Math.max(maxY, y + HALF_NODE_HEIGHT);
      });
    });
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const pad = 40;
    const k = clampZoom(Math.min((width - pad * 2) / contentW, (height - pad * 2) / contentH));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = width / 2 - centerX * k;
    const y = height / 2 - centerY * k;
    setView({ x, y, k });
  }, [nodes]);

  const zoomBy = React.useCallback((factor: number) => {
    setView((prev) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { ...prev, k: clampZoom(prev.k * factor) };
      }
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const worldX = (cx - prev.x) / prev.k;
      const worldY = (cy - prev.y) / prev.k;
      const k = clampZoom(prev.k * factor);
      const x = cx - worldX * k;
      const y = cy - worldY * k;
      return { x, y, k };
    });
  }, []);

  const handleZoomIn = React.useCallback(() => {
    zoomBy(ZOOM_STEP);
  }, [zoomBy]);

  const handleZoomOut = React.useCallback(() => {
    zoomBy(1 / ZOOM_STEP);
  }, [zoomBy]);

  const handleRefresh = React.useCallback(() => {
    dragStartRef.current = null;
    viewStartRef.current = null;
    nodeDragRef.current = null;
    setNodePositions(new Map());
    resetView();
  }, [resetView]);

  const handleCopyJson = React.useCallback(() => {
    try {
      const idToParent = new Map<string, string | null>();
      const parentToChildren = new Map<string | null, string[]>();
      const nodeById = new Map<string, Node>();
      nodes.forEach((node) => {
        if (node.id === ROOT_NODE_ID) return;
        const rawParentId = node.parentId ?? null;
        const normalizedParentId = rawParentId === ROOT_NODE_ID ? null : rawParentId;
        idToParent.set(node.id, normalizedParentId);
        const list = parentToChildren.get(normalizedParentId) || [];
        list.push(node.id);
        parentToChildren.set(normalizedParentId, list);
        nodeById.set(node.id, node);
      });
      const combinedConnectors = new Map<string, LinkConnectorPref>();
      connectorDefaultsRef.current.forEach((value, key) => {
        combinedConnectors.set(key, { ...value });
      });
      linkConnectors.forEach((value, key) => {
        combinedConnectors.set(key, { ...value });
      });
      const connectorEntries = Array.from(combinedConnectors.entries()).flatMap(([edgeKey, pref]) => {
        const info = edgeConnectorMapRef.current.get(edgeKey);
        const [rawParent, rawChild] = edgeKey.split("->");
        const parentIdRaw = info?.parentId ?? (rawParent === "null" ? null : rawParent ?? null);
        const parentId = parentIdRaw === ROOT_NODE_ID ? null : parentIdRaw;
        if (parentId === null) {
          return [];
        }
        const childId = info?.childId ?? rawChild ?? "";
        return [
          {
            edgeKey,
            description: "parent-child",
            colorLine: "grey",
            parentId,
            childId,
            connector: pref,
            custom: linkConnectors.has(edgeKey),
          },
        ];
      });
      const siblingConnectors: Array<{
        edgeKey: string;
        parentId: string | null;
        childId: string;
        siblingId: string;
        description: string;
        colorLine: string;
        connector: null;
        custom: false;
      }> = [];
      parentToChildren.forEach((children, parentId) => {
        if (children.length <= 1) return;
        const sorted = [...children].sort((a, b) => {
          const aIdx = nodeById.get(a)?.idx ?? 0;
          const bIdx = nodeById.get(b)?.idx ?? 0;
          return aIdx - bIdx;
        });
        sorted.forEach((childId, index) => {
          const nextId = sorted[index + 1];
          if (!nextId) return;
          const edgeKey = `siblings:${parentId ?? "null"}:${childId}<->${nextId}`;
          siblingConnectors.push({
            edgeKey,
            parentId,
            childId: nextId,
            siblingId: childId,
            description: "siblings",
            colorLine: "red-dashed",
            connector: null,
            custom: false,
          });
        });
      });
      const payload = nodes
        .filter((node) => node.id !== ROOT_NODE_ID)
        .map((node) => {
          const parentId = idToParent.get(node.id) ?? null;
          const children = parentToChildren.get(node.id) ?? [];
          const siblings = (parentToChildren.get(parentId) || []).filter((sibling) => sibling !== node.id);
          const edgeKey = parentId ? getEdgeKey(parentId, node.id) : null;
          const connectorPref = edgeKey ? combinedConnectors.get(edgeKey) ?? null : null;
          return {
            id: node.id,
            parentId,
            role: node.role,
            branchId: node.branchId ?? null,
            children,
            siblings,
            connectorPref,
          };
        });
      const text = JSON.stringify(
        { nodes: payload, connectors: [...connectorEntries, ...siblingConnectors] },
        null,
        2,
      );
      navigator.clipboard.writeText(text);
      alert("Graph JSON copied to clipboard");
    } catch (error) {
      console.error(error);
      alert("Copy failed");
    }
  }, [getEdgeKey, linkConnectors, nodes]);

  const handleCanvasClick = React.useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!linkEditMode) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      let restoreCandidate: { childId: string; dist: number } | null = null;
      restoreTargetsRef.current.forEach((target) => {
        const dx = target.x - world.x;
        const dy = target.y - world.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= target.radius && (!restoreCandidate || dist < restoreCandidate.dist)) {
          restoreCandidate = { childId: target.childId, dist };
        }
      });
      if (restoreCandidate) {
        restoreLink(restoreCandidate.childId);
        return;
      }
      let best: { childId: string; parentId: string | null; dist: number } | null = null;
      cutTargetsRef.current.forEach((target) => {
        if (!target.parentId) return;
        const dx = target.x - world.x;
        const dy = target.y - world.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 24 && (!best || dist < best.dist)) {
          best = { childId: target.childId, parentId: target.parentId, dist };
        }
      });
      if (!best) return;
      if (overrides.has(best.childId)) {
        restoreLink(best.childId);
        return;
      }
      cutLink(best.childId, best.parentId);
    },
    [linkEditMode, overrides, screenToWorld, cutLink, restoreLink],
  );

  const controlButtonClass =
    "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted";
  const iconClass = "h-3.5 w-3.5";
  const cutCount = overrides.size;

  React.useEffect(() => {
    render();
    const ro = new ResizeObserver(() => render());
    if (containerRef.current) ro.observe(containerRef.current);
    let cleanup: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {});
    const canvas = canvasRef.current;
    if (canvas) {
      const setCanvasCursor = (value: string) => {
        if (canvas.style.cursor !== value) {
          canvas.style.cursor = value;
        }
      };
      if (linkEditMode) {
        setCanvasCursor("crosshair");
      }
      const onMouseDown = (e: MouseEvent) => {
        if (linkEditMode) {
          setCanvasCursor("crosshair");
          return;
        }
        suppressClickRef.current = false;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const connectorHit = getConnectorHit(world.x, world.y);
        if (connectorHit) {
          const edgeInfo = findEdgeForConnector(connectorHit.nodeId, connectorHit.connectorId, world);
          if (edgeInfo) {
            connectorDragRef.current = {
              nodeId: connectorHit.nodeId,
              connectorId: connectorHit.connectorId,
              edgeKey: edgeInfo.edgeKey,
              role: edgeInfo.role,
              parentId: edgeInfo.parentId,
              childId: edgeInfo.childId,
              startX: world.x,
              startY: world.y,
              hasMoved: false,
            };
            updateDraggingConnector({ nodeId: connectorHit.nodeId, connectorId: connectorHit.connectorId });
            updateHoveredConnector({ nodeId: connectorHit.nodeId, connectorId: connectorHit.connectorId });
            setCanvasCursor("grabbing");
            e.preventDefault();
            return;
          }
        }
        let hitId: string | null = null;
        for (const [id, b] of boundsRef.current) {
          if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
            hitId = id;
            break;
          }
        }
        if (hitId) {
          if (hitId === ROOT_NODE_ID) {
            updateHoveredConnector(null);
            setCanvasCursor("default");
            return;
          }
          const b = boundsRef.current.get(hitId)!;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          nodeDragRef.current = { id: hitId, ox: world.x - cx, oy: world.y - cy };
          updateHoveredConnector(null);
          setCanvasCursor("grabbing");
          return;
        }
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        viewStartRef.current = { x: view.x, y: view.y };
        updateHoveredConnector(null);
        setCanvasCursor("grabbing");
      };
      const onMouseMove = (e: MouseEvent) => {
        if (linkEditMode) {
          setCanvasCursor("crosshair");
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        const connectorDrag = connectorDragRef.current;
        if (connectorDrag) {
          const dx = world.x - connectorDrag.startX;
          const dy = world.y - connectorDrag.startY;
          if (!connectorDrag.hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
            connectorDrag.hasMoved = true;
            suppressClickRef.current = true;
          }
          const hoverTarget = getConnectorHit(world.x, world.y);
          const isValid = isValidConnectorTarget(connectorDrag, hoverTarget);
          updateHoveredConnector(
            isValid && hoverTarget
              ? { nodeId: hoverTarget.nodeId, connectorId: hoverTarget.connectorId }
              : null
          );
          setCanvasCursor("grabbing");
          return;
        }
        const dragInfo = nodeDragRef.current;
        if (dragInfo) {
          const { id, ox, oy } = dragInfo;
          const nx = world.x - ox;
          const ny = world.y - oy;
          setNodePositions((prev) => {
            const m = new Map(prev);
            m.set(id, { x: nx, y: ny });
            return m;
          });
          setCanvasCursor("grabbing");
          return;
        }
        const dragStart = dragStartRef.current;
        const viewStart = viewStartRef.current;
        if (dragStart && viewStart) {
          const dx = e.clientX - dragStart.x;
          const dy = e.clientY - dragStart.y;
          setView((v) => ({ ...v, x: viewStart.x + dx, y: viewStart.y + dy }));
          setCanvasCursor("grabbing");
          return;
        }
        const hover = getConnectorHit(world.x, world.y);
        if (hover) {
          updateHoveredConnector({ nodeId: hover.nodeId, connectorId: hover.connectorId });
          setCanvasCursor("pointer");
        } else if (hoveredConnectorRef.current) {
          updateHoveredConnector(null);
          setCanvasCursor("default");
        }
      };
      const onMouseUp = () => {
        if (linkEditMode) {
          setCanvasCursor("crosshair");
          return;
        }
        const connectorDrag = connectorDragRef.current;
        if (connectorDrag) {
          const target = hoveredConnectorRef.current;
          if (connectorDrag.hasMoved) {
            suppressClickRef.current = true;
            if (isValidConnectorTarget(connectorDrag, target) && target) {
              applyConnectorSelection(
                connectorDrag.edgeKey,
                connectorDrag.role,
                target.connectorId,
                connectorDrag.parentId,
                connectorDrag.childId
              );
            }
          }
          updateDraggingConnector(null);
          connectorDragRef.current = null;
        }
        dragStartRef.current = null;
        viewStartRef.current = null;
        nodeDragRef.current = null;
        setCanvasCursor(hoveredConnectorRef.current ? "pointer" : "default");
      };
      const onMouseLeave = () => {
        if (linkEditMode) {
          setCanvasCursor("crosshair");
          return;
        }
        if (connectorDragRef.current || nodeDragRef.current || dragStartRef.current) {
          return;
        }
        if (hoveredConnectorRef.current) {
          updateHoveredConnector(null);
        }
        setCanvasCursor("default");
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.001);
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        setView((v) => {
          const world = screenToWorld(sx, sy, v);
          const k = clampZoom(v.k * factor);
          const x = sx - world.x * k;
          const y = sy - world.y * k;
          return { x, y, k };
        });
      };
      const onClick = (e: MouseEvent) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (dragStartRef.current && viewStartRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        for (const [id, b] of boundsRef.current) {
          if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
            if (id === ROOT_NODE_ID) {
              continue;
            }
            const el = document.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            break;
          }
        }
      };
      canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      canvas.addEventListener("mouseleave", onMouseLeave);
      const wheelListenerOptions: AddEventListenerOptions = { passive: false };
      canvas.addEventListener("wheel", onWheel, wheelListenerOptions);
      if (!linkEditMode) {
        canvas.addEventListener("click", onClick);
      }
      cleanup = () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        canvas.removeEventListener("mouseleave", onMouseLeave);
        canvas.removeEventListener("wheel", onWheel, wheelListenerOptions);
        if (!linkEditMode) {
          canvas.removeEventListener("click", onClick);
        }
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      if (cleanup) cleanup();
      ro.disconnect();
    };
  }, [
    applyConnectorSelection,
    findEdgeForConnector,
    getConnectorHit,
    isValidConnectorTarget,
    render,
    screenToWorld,
    updateDraggingConnector,
    updateHoveredConnector,
    view,
    linkEditMode,
  ]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, [number, number]>;
        const map = new Map<string, { x: number; y: number }>();
        (Object.entries(obj) as Array<[string, [number, number]]>).forEach(([id, arr]) => {
          if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === "number" && typeof arr[1] === "number") {
            map.set(id, { x: arr[0], y: arr[1] });
          }
        });
        setNodePositions(map);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      if (nodePositions.size === 0) {
        localStorage.removeItem(POS_KEY);
        return;
      }
      const obj: Record<string, [number, number]> = {};
      nodePositions.forEach((v, k) => {
        obj[k] = [v.x, v.y];
      });
      localStorage.setItem(POS_KEY, JSON.stringify(obj));
    } catch {}
  }, [nodePositions]);

  React.useEffect(() => {
    resetView();
  }, [resetView]);

  return (
    <section className="flex h-full w-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Thread Tree (all branches)</h2>
          <p className="text-xs text-muted-foreground">
            Drag to pan, zoom with wheel or buttons, click a node to jump.
          </p>
          {linkEditMode && (
            <p className="text-[11px] text-amber-600">
              Click a ✂ label to cut a link. Click the blue ↺ badge on a node to restore it.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${controlButtonClass} ${
              linkEditMode ? "border-primary bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => setLinkEditMode((prev) => !prev)}
            title="Toggle link editing mode"
          >
            <Scissors className={iconClass} />
            <span>{linkEditMode ? "Finish Editing" : "Edit Links"}</span>
          </button>
          {cutCount > 0 && (
            <button
              type="button"
              className={controlButtonClass}
              onClick={resetLinks}
              title="Restore all link cuts"
            >
              <RotateCcw className={iconClass} />
              <span>Reset Cuts ({cutCount})</span>
            </button>
          )}
          <button
            type="button"
            className={controlButtonClass}
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <ZoomOut className={iconClass} />
            <span>Zoom -</span>
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <ZoomIn className={iconClass} />
            <span>Zoom +</span>
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={handleRefresh}
            title="Reset positions"
          >
            <RefreshCw className={iconClass} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={handleCopyJson}
            title="Copy graph JSON"
          >
            <CopyIcon className={iconClass} /> Copy JSON
          </button>
        </div>
      </header>
      <div
        ref={(el) => {
          containerRef.current = el as HTMLDivElement;
        }}
        className="flex-1 overflow-hidden"
      >
        <canvas
          ref={(el) => {
            canvasRef.current = el as HTMLCanvasElement;
          }}
          className="h-full w-full"
          onClick={handleCanvasClick}
        />
      </div>
    </section>
  );
}




