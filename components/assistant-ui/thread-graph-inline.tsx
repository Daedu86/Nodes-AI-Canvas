"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import { Copy as CopyIcon } from "lucide-react";
import React from "react";

function extractText(msg: any): string {
  try {
    const parts = Array.isArray(msg?.content) ? msg.content : [];
    const text = parts
      .map((p: any) => (p?.type === "text" && typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join(" • ");
    return text || "";
  } catch {
    return "";
  }
}

type RepoItem = { message: any; parentId: string | null };

type Node = {
  id: string;
  parentId: string | null;
  role: string;
  text: string;
  depth: number;
  idx: number;
  x?: number;
  y?: number;
  branchId?: any;
};

export function ThreadGraphInline() {
  const runtime = useAssistantRuntime();
  const [repoItems, setRepoItems] = React.useState<RepoItem[]>([]);

  React.useEffect(() => {
    try {
      const exp = runtime?.threads?.main?.export();
      const items = Array.isArray(exp?.messages) ? (exp!.messages as RepoItem[]) : [];
      setRepoItems(items);
    } catch {
      setRepoItems([]);
    }
  }, [runtime]);

  const nodes: Node[] = React.useMemo(() => {
    const arr = Array.isArray(repoItems) ? repoItems : [];
    const map = new Map<string, RepoItem>();
    arr.forEach((it) => map.set(it.message?.id, it));
    const depthCache = new Map<string, number>();
    const getDepth = (m: any): number => {
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
    return arr.map((it: RepoItem, i: number) => {
      const id = String(it.message?.id ?? i);
      const parentId = it.parentId ?? null;
      const node: Node = {
        id,
        parentId,
        role: String(it.message?.role ?? ""),
        text: extractText(it.message).slice(0, 100),
        depth: 0,
        idx: i,
        branchId: (it.message as any)?.branchId,
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
  const POS_KEY = "a-ui.graph-inline-pos.v1";
  const boundsRef = React.useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - view.x) / view.k, y: (sy - view.y) / view.k });

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
    const levelYSteps = levels.map((l) => 80);
    const halfNodeW = 110;
    levels.forEach((l, depth) => {
      const stepY = levelYSteps[depth] || 60;
      l.forEach((n, i) => {
        const x = marginX + depth * xStep + halfNodeW;
        const y = marginY + (i + 1) * stepY;
        (n as any).x = x;
        (n as any).y = y;
        const pos = nodePositions.get(n.id);
        if (pos) {
          (n as any).x = pos.x;
          (n as any).y = pos.y;
        }
      });
    });

  const idToNode = new Map(nodes.map((n) => [n.id, n] as const));
    nodes.forEach((n) => {
      if (!n.parentId) return;
      const p = idToNode.get(String(n.parentId));
      if (!p || p.x == null || p.y == null || n.x == null || n.y == null) return;
      ctx.beginPath();
      ctx.moveTo(p.x + halfNodeW, p.y);
      ctx.lineTo(n.x - halfNodeW, n.y);
      const hue = n.branchId ? (String(n.branchId).length * 67) % 360 : null;
      ctx.strokeStyle = hue == null ? "rgba(100,100,100,0.7)" : `hsla(${hue},60%,45%,0.75)`;
      ctx.lineWidth = hue == null ? 1.6 : 1.2;
      ctx.stroke();
    });

    try {
      const groups = new Map<string, Node[]>();
      nodes.forEach((n) => {
        const key = `${n.parentId ?? "root"}::${n.depth}`;
        const arr = groups.get(key) || [];
        arr.push(n);
        groups.set(key, arr);
      });
      ctx.save();
      ctx.setLineDash?.([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(59,130,246,0.6)";
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        const ordered = arr
          .filter((n) => n.x != null && n.y != null)
          .sort((a, b) => (a.x! - b.x!));
        for (let i = 0; i < ordered.length - 1; i++) {
          const a = ordered[i];
          const b = ordered[i + 1];
          if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
          ctx.beginPath();
          ctx.moveTo(a.x + halfNodeW, a.y + 28);
          ctx.lineTo(b.x - halfNodeW, b.y - 28);
          ctx.stroke();
        }
      }
      ctx.restore();
    } catch {}

    const m = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    const isDarkBg = (() => {
      if (!m) return false;
      const r = +m[1];
      const g = +m[2];
      const b = +m[3];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
    })();
    const textColor = isDarkBg ? "#e5e7eb" : "#111827";
    const roleColor = (r: string) =>
      r === "user" ? "#2563eb" : r === "assistant" ? "#16a34a" : "#6b7280";
    nodes.forEach((n) => {
      if (n.x == null || n.y == null) return;
      const w = 220;
      const h = 56;
      const r = 8;
      const x = n.x - w / 2;
      const y = n.y - h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = isDarkBg ? "#9CA3AF" : "rgba(0,0,0,0.15)";
      ctx.stroke();

      const badge = (n.role || "").toUpperCase();
      ctx.fillStyle = roleColor(n.role);
      ctx.fillRect(x + 8, y + 8, ctx.measureText(badge).width + 12, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(badge, x + 14, y + 20);

      ctx.fillStyle = textColor;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      const preview = (n.text || "").slice(0, 80);
      const textY = y + 36;
      ctx.fillText(preview, x + 8, textY, w - 16);

      boundsRef.current.set(n.id, { x, y, w, h });
    });

    ctx.restore();
  }, [nodes, view]);

  React.useEffect(() => {
    render();
    const ro = new ResizeObserver(() => render());
    if (containerRef.current) ro.observe(containerRef.current);
    let cleanup: (() => void) | undefined;
    let raf = requestAnimationFrame(() => {});
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
        if (nodeDragRef.current) {
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const world = screenToWorld(sx, sy);
          const { id, ox, oy } = nodeDragRef.current;
          const nx = world.x - ox;
          const ny = world.y - oy;
          setNodePositions((prev) => {
            const m = new Map(prev);
            m.set(id, { x: nx, y: ny });
            return m;
          });
          return;
        }
        if (!dragStartRef.current || !viewStartRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setView((v) => ({ ...v, x: viewStartRef.current!.x + dx, y: viewStartRef.current!.y + dy }));
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
        const world = screenToWorld(sx, sy);
        setView((v) => {
          const k = Math.min(3, Math.max(0.3, v.k * factor));
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
      canvas.addEventListener("wheel", onWheel, { passive: false } as any);
      canvas.addEventListener("click", onClick);
      cleanup = () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        canvas.removeEventListener("wheel", onWheel as any);
        canvas.removeEventListener("click", onClick);
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      if (cleanup) cleanup();
      ro.disconnect();
    };
  }, [render, view]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, [number, number]>;
        const map = new Map<string, { x: number; y: number }>();
        Object.entries(obj).forEach(([id, arr]) => {
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
      const obj: Record<string, [number, number]> = {};
      nodePositions.forEach((v, k) => {
        obj[k] = [v.x, v.y];
      });
      localStorage.setItem(POS_KEY, JSON.stringify(obj));
    } catch {}
  }, [nodePositions]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const maxDepth = nodes.reduce((a, n) => Math.max(a, n.depth), 0);
    const levels: Node[][] = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((n) => levels[n.depth].push(n));
    const marginX = 80;
    const marginY = 40;
    const xStep = (width - marginX * 2) / Math.max(1, maxDepth || 1);
    const levelYSteps = levels.map((l) => (height - marginY * 2) / Math.max(1, l.length || 1));
    const halfNodeW = 110;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    levels.forEach((l, depth) => {
      const stepY = levelYSteps[depth] || 60;
      l.forEach((n, i) => {
        const x = marginX + depth * xStep + halfNodeW;
        const y = marginY + (i + 1) * stepY;
        minX = Math.min(minX, x - halfNodeW);
        maxX = Math.max(maxX, x + halfNodeW);
        minY = Math.min(minY, y - 28);
        maxY = Math.max(maxY, y + 28);
      });
    });
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const pad = 40;
    const k = Math.min(
      3,
      Math.max(0.3, Math.min((width - pad * 2) / contentW, (height - pad * 2) / contentH))
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = width / 2 - centerX * k;
    const y = height / 2 - centerY * k;
    setView({ x, y, k });
  }, [nodes.length]);

  return (
    <section className="flex h-full w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Thread Tree (all branches)</h2>
          <p className="text-xs text-muted-foreground">Drag to pan, wheel to zoom, click node to jump.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
          onClick={() => {
            try {
              const idToParent = new Map<string, string | null>();
              const parentToChildren = new Map<string | null, string[]>();
              nodes.forEach((n) => {
                idToParent.set(n.id, n.parentId ?? null);
                const key = n.parentId ?? null;
                const arr = parentToChildren.get(key) || [];
                arr.push(n.id);
                parentToChildren.set(key, arr);
              });
              const out = nodes.map((n) => {
                const id = n.id;
                const parentId = idToParent.get(id) ?? null;
                const children = parentToChildren.get(id) ?? [];
                const siblings = (parentToChildren.get(parentId) || []).filter((sid) => sid !== id);
                return { id, parentId, children, siblings };
              });
              const text = JSON.stringify(out, null, 2);
              navigator.clipboard.writeText(text);
              alert("Graph JSON copied to clipboard");
            } catch (e) {
              console.error(e);
              alert("Copy failed");
            }
          }}
        >
          <CopyIcon className="h-3.5 w-3.5" /> Copy JSON
        </button>
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

