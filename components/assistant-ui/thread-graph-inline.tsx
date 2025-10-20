"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import { Copy as CopyIcon, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";
import { useThreadRepoItems, type ThreadRepoItem } from "./use-thread-repo-items";

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

type Point = { x: number; y: number };

type EdgeConnectorInfo = {
  from: ConnectorId;
  to: ConnectorId;
  points: { from: Point; to: Point };
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
    return arr.map((it: ThreadRepoItem, i: number) => {
      const id = String(it.message?.id ?? i);
      const parentId = it.parentId ?? null;
      const message = it.message;
      const branchId =
        message && typeof message === "object" && "branchId" in message
          ? (message as { branchId?: unknown }).branchId
          : undefined;
      const node: Node = {
        id,
        parentId,
        role: String(it.message?.role ?? ""),
        text: extractText(it.message).slice(0, 100),
        depth: 0,
        idx: i,
        branchId,
      };
      node.depth = parentId === null ? 0 : getDepth(it.message);
      return node;
    });
  }, [repoItems]);

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

  const POS_KEY = "a-ui.graph-inline-pos.v1";
  const CONN_KEY = "a-ui.graph-inline-conn.v1";
  const boundsRef = React.useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
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

  const chooseDefaultConnectors = React.useCallback(
    (parent: Node | undefined, child: Node): LinkConnectorPref => {
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

  React.useEffect(() => {
    setLinkConnectors((prev) => {
      if (prev.size === 0) return prev;
      const defaults = connectorDefaultsRef.current;
      let changed = false;
      const next = new Map<string, LinkConnectorPref>();
      prev.forEach((value, key) => {
        if (defaults.has(key)) {
          next.set(key, value);
        } else {
          changed = true;
        }
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

    nodes.forEach((n) => {
      if (!n.parentId) return;
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

      const parentUsed = connectorUsage.get(parent.id) ?? new Set<ConnectorId>();
      parentUsed.add(pref.from);
      connectorUsage.set(parent.id, parentUsed);
      const childUsed = connectorUsage.get(n.id) ?? new Set<ConnectorId>();
      childUsed.add(pref.to);
      connectorUsage.set(n.id, childUsed);
    });

    nodes.forEach((n) => {
      if (n.x == null || n.y == null) return;
      const w = NODE_WIDTH;
      const h = NODE_HEIGHT;
      const x = n.x - HALF_NODE_WIDTH;
      const y = n.y - HALF_NODE_HEIGHT;
      const radius = 10;

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
      ctx.fillStyle = nodeFill;
      ctx.fill();
      ctx.strokeStyle = nodeStroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      const role = (n.role || "").toUpperCase();
      if (role) {
        ctx.fillText(role, x + 8, y + 16);
      }

      ctx.fillStyle = textColor;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      const preview = (n.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const textY = y + 36;
      if (preview) {
        ctx.fillText(preview, x + 8, textY, w - 16);
      }

      const connectorMap = new Map<ConnectorId, Point>();
      connectorPositions.set(n.id, connectorMap);
      const usedConnectors = connectorUsage.get(n.id);
      ALL_CONNECTORS.forEach((connectorId) => {
        const point = getConnectorPoint(n, connectorId);
        connectorMap.set(connectorId, point);
        const isUsed = usedConnectors?.has(connectorId) ?? false;
        const connectorRadius = isUsed ? 3.4 : 2.4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, connectorRadius, 0, Math.PI * 2);
        ctx.fillStyle = isUsed ? "#2563eb" : isDarkBg ? "rgba(148,163,184,0.55)" : "rgba(156,163,175,0.6)";
        ctx.strokeStyle = isDarkBg ? "rgba(17,24,39,0.85)" : "#f9fafb";
        ctx.lineWidth = isUsed ? 1.2 : 0.8;
        ctx.fill();
        ctx.stroke();
      });

      boundsRef.current.set(n.id, { x, y, w, h });
    });

    connectorPositionsRef.current = connectorPositions;
    edgeConnectorMapRef.current = edgeConnectorMap;

    ctx.restore();
  }, [chooseDefaultConnectors, getEdgeKey, linkConnectors, nodePositions, nodes, view]);

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
      nodes.forEach((node) => {
        idToParent.set(node.id, node.parentId ?? null);
        const key = node.parentId ?? null;
        const list = parentToChildren.get(key) || [];
        list.push(node.id);
        parentToChildren.set(key, list);
      });
      const payload = nodes.map((node) => {
        const parentId = idToParent.get(node.id) ?? null;
        const children = parentToChildren.get(node.id) ?? [];
        const siblings = (parentToChildren.get(parentId) || []).filter((sibling) => sibling !== node.id);
        return { id: node.id, parentId, children, siblings };
      });
      const text = JSON.stringify(payload, null, 2);
      navigator.clipboard.writeText(text);
      alert("Graph JSON copied to clipboard");
    } catch (error) {
      console.error(error);
      alert("Copy failed");
    }
  }, [nodes]);

  const controlButtonClass =
    "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted";
  const iconClass = "h-3.5 w-3.5";

  React.useEffect(() => {
    render();
    const ro = new ResizeObserver(() => render());
    if (containerRef.current) ro.observe(containerRef.current);
    let cleanup: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {});
    const canvas = canvasRef.current;
    if (canvas) {
      const onMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        let hitId: string | null = null;
        for (const [id, b] of boundsRef.current) {
          if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
            hitId = id;
            break;
          }
        }
        if (hitId) {
          const b = boundsRef.current.get(hitId)!;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          nodeDragRef.current = { id: hitId, ox: world.x - cx, oy: world.y - cy };
        } else {
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          viewStartRef.current = { x: view.x, y: view.y };
        }
      };
      const onMouseMove = (e: MouseEvent) => {
        const dragInfo = nodeDragRef.current;
        if (dragInfo) {
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const world = screenToWorld(sx, sy);
          const { id, ox, oy } = dragInfo;
          const nx = world.x - ox;
          const ny = world.y - oy;
          setNodePositions((prev) => {
            const m = new Map(prev);
            m.set(id, { x: nx, y: ny });
            return m;
          });
          return;
        }
        const dragStart = dragStartRef.current;
        const viewStart = viewStartRef.current;
        if (!dragStart || !viewStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setView((v) => ({ ...v, x: viewStart.x + dx, y: viewStart.y + dy }));
      };
      const onMouseUp = () => {
        dragStartRef.current = null;
        viewStartRef.current = null;
        nodeDragRef.current = null;
        canvas.style.cursor = "default";
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
        if (dragStartRef.current && viewStartRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = screenToWorld(sx, sy);
        for (const [id, b] of boundsRef.current) {
          if (world.x >= b.x && world.x <= b.x + b.w && world.y >= b.y && world.y <= b.y + b.h) {
            const el = document.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            break;
          }
        }
      };
      canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      const wheelListenerOptions: AddEventListenerOptions = { passive: false };
      canvas.addEventListener("wheel", onWheel, wheelListenerOptions);
      canvas.addEventListener("click", onClick);
      cleanup = () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        canvas.removeEventListener("wheel", onWheel, wheelListenerOptions);
        canvas.removeEventListener("click", onClick);
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      if (cleanup) cleanup();
      ro.disconnect();
    };
  }, [render, screenToWorld, view]);

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
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        />
      </div>
    </section>
  );
}


