"use client";

import React from "react";
import * as THREE from "three";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

type Canvas3DProps = {
  edges: ThreadGraphFlowEdge[];
  nodes: ThreadGraphFlowNode[];
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
};

type Vec3 = [number, number, number];

const WORLD_SCALE = 0.36; // maps px -> world units
const Z_GAP = 72;
const TYPE_LAYER_OFFSET = {
  message: 0,
  root: -0.12,
  artifact: 0.55,
} as const;

const SEMANTIC_LAYER_OFFSET: Partial<Record<NonNullable<ThreadGraphFlowNode["data"]["semanticType"]>, number>> = {
  decision: 0.08,
  evidence: 0.12,
  plan: 0.16,
  question: 0.2,
  draft: 0.24,
} as const;

const getDepth = (node: ThreadGraphFlowNode) =>
  typeof node.data?.depth === "number" && Number.isFinite(node.data.depth) ? node.data.depth : 0;

const getNodeSize = (node: ThreadGraphFlowNode): Vec3 => {
  const kind = node.data?.kind;
  if (kind === "root") return [280, 150, 22];
  if (kind === "artifact") return [260, 170, 22];
  return [300, 190, 22];
};

const getNodeFill = (node: ThreadGraphFlowNode) => {
  const accent = typeof node.data?.accent === "string" ? node.data.accent : null;
  if (accent) return accent;
  if (node.data?.kind === "artifact") return "#7c3aed";
  if (node.data?.role === "assistant") return "#2563eb";
  if (node.data?.role === "user") return "#0f766e";
  return "#64748b";
};

const getNodeSurface = (node: ThreadGraphFlowNode) => {
  // Keep the surface neutral and use accent as a glow/border so text stays readable.
  if (node.data?.kind === "artifact") return "#f8fafc";
  if (node.data?.kind === "root") return "#f1f5f9";
  return "#ffffff";
};

function clampText(value: string, max = 46) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function resolveBranchDepthByNodeId(nodes: ThreadGraphFlowNode[], edges: ThreadGraphFlowEdge[]) {
  const kindById = new Map<string, ThreadGraphFlowNode["data"]["kind"]>();
  const depthById = new Map<string, number>();
  nodes.forEach((node) => {
    kindById.set(node.id, node.data?.kind);
    if (node.data?.kind !== "artifact") {
      depthById.set(node.id, getDepth(node));
    }
  });

  // Artifacts don't have intrinsic depth. Assign them a depth based on their first context edge.
  edges.forEach((edge) => {
    if (edge.data?.tone !== "context") return;
    const sourceKind = kindById.get(edge.source);
    const targetKind = kindById.get(edge.target);

    if (sourceKind === "artifact" && targetKind !== "artifact") {
      const targetDepth = depthById.get(edge.target);
      if (typeof targetDepth === "number" && !depthById.has(edge.source)) {
        depthById.set(edge.source, targetDepth);
      }
    } else if (targetKind === "artifact" && sourceKind !== "artifact") {
      const sourceDepth = depthById.get(edge.source);
      if (typeof sourceDepth === "number" && !depthById.has(edge.target)) {
        depthById.set(edge.target, sourceDepth);
      }
    }
  });

  return depthById;
}

function buildCenteredPositions(nodes: ThreadGraphFlowNode[], edges: ThreadGraphFlowEdge[]) {
  const depthById = resolveBranchDepthByNodeId(nodes, edges);
  const coords = nodes.map((node) => {
    const pos = node.position ?? { x: 0, y: 0 };
    const kind = node.data?.kind ?? "message";
    const depth = depthById.get(node.id) ?? getDepth(node);
    const typeOffset =
      kind === "artifact"
        ? TYPE_LAYER_OFFSET.artifact
        : kind === "root"
          ? TYPE_LAYER_OFFSET.root
          : TYPE_LAYER_OFFSET.message;
    const semanticOffset =
      kind === "artifact" && node.data?.semanticType ? (SEMANTIC_LAYER_OFFSET[node.data.semanticType] ?? 0) : 0;
    const z = (depth + typeOffset + semanticOffset) * Z_GAP;
    return {
      id: node.id,
      x: pos.x * WORLD_SCALE,
      y: -pos.y * WORLD_SCALE,
      z,
    };
  });

  const xs = coords.map((p) => p.x);
  const ys = coords.map((p) => p.y);
  const zs = coords.map((p) => p.z);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };

  const map = new Map<string, Vec3>();
  coords.forEach((p) => {
    map.set(p.id, [p.x - center.x, p.y - center.y, p.z - center.z]);
  });
  return map;
}

function DragNode({
  fill,
  surface,
  label,
  nodeId,
  onSelect,
  position,
  selected,
  size,
  onMove,
}: {
  fill: string;
  surface: string;
  label: string;
  nodeId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, next: Vec3) => void;
  position: Vec3;
  selected: boolean;
  size: Vec3;
}) {
  const draggingRef = React.useRef(false);
  const dragPlaneRef = React.useRef(new THREE.Plane());
  const dragOffsetRef = React.useRef(new THREE.Vector3());

  const outline = fill;
  const outlineOpacity = selected ? 0.9 : 0.4;

  const handlePointerDown = React.useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onSelect(nodeId);
      draggingRef.current = true;

      // Drag on a plane parallel to the ground (XY) at the node's Z.
      const plane = dragPlaneRef.current;
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(position[0], position[1], position[2]),
      );

      const hit = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
      dragOffsetRef.current.set(position[0], position[1], position[2]).sub(hit);
      (e.target as HTMLElement | undefined)?.setPointerCapture?.(e.pointerId);
    },
    [nodeId, onSelect, position],
  );

  const handlePointerUp = React.useCallback((e: ThreeEvent<PointerEvent>) => {
    draggingRef.current = false;
    (e.target as HTMLElement | undefined)?.releasePointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = React.useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!draggingRef.current) return;
      e.stopPropagation();

      const plane = dragPlaneRef.current;
      const ray = e.ray;
      const next = new THREE.Vector3();
      if (!ray.intersectPlane(plane, next)) return;
      next.add(dragOffsetRef.current);

      // Holding shift lets you “pull” in Z using pointer Y delta (simple, predictable).
      let z = position[2];
      if (e.shiftKey) {
        z = THREE.MathUtils.clamp(position[2] + e.movementY * -0.8, -800, 800);
      }

      onMove(nodeId, [next.x, next.y, z]);
    },
    [nodeId, onMove, position],
  );

  return (
    <group position={position}>
      <RoundedBox
        args={[size[0], size[1], size[2]]}
        radius={12}
        smoothness={10}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
      >
        <meshStandardMaterial
          color={surface}
          emissive={fill}
          emissiveIntensity={selected ? 0.16 : 0.08}
          metalness={0.08}
          roughness={0.32}
        />
      </RoundedBox>
      <RoundedBox args={[size[0] + 6, size[1] + 6, size[2] + 2]} radius={14} smoothness={10}>
        <meshStandardMaterial
          color={outline}
          transparent
          opacity={outlineOpacity}
          metalness={0.25}
          roughness={0.45}
        />
      </RoundedBox>
      <Text
        position={[0, size[1] / 2 - 22, size[2] / 2 + 2]}
        fontSize={14}
        maxWidth={size[0] - 40}
        anchorX="center"
        anchorY="top"
        color="#0b1220"
      >
        {label}
      </Text>
      <Text
        position={[0, -size[1] / 2 + 18, size[2] / 2 + 2]}
        fontSize={11}
        anchorX="center"
        anchorY="bottom"
        color="rgba(11,18,32,0.72)"
      >
        {selected ? "selected" : "drag to move, shift-drag for depth"}
      </Text>
    </group>
  );
}

export function ThreadGraph3D({
  edges,
  nodes,
  onSelectNode,
  selectedNodeId,
}: Canvas3DProps) {
  const basePositions = React.useMemo(() => buildCenteredPositions(nodes, edges), [edges, nodes]);
  const [overrides, setOverrides] = React.useState<Map<string, Vec3>>(() => new Map());

  React.useEffect(() => {
    // Reset local overrides when graph identity changes materially.
    setOverrides(new Map());
  }, [basePositions]);

  const getPos = React.useCallback(
    (id: string): Vec3 => overrides.get(id) ?? basePositions.get(id) ?? [0, 0, 0],
    [basePositions, overrides],
  );

  const moveNode = React.useCallback((id: string, next: Vec3) => {
    setOverrides((current) => {
      const cloned = new Map(current);
      cloned.set(id, next);
      return cloned;
    });
  }, []);

  const handleCanvasPointerDown = React.useCallback(() => onSelectNode(null), [onSelectNode]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.1),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.94))] shadow-[0_30px_110px_-60px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.12),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.92))]">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 860], fov: 45, near: 1, far: 4000 }}
        onPointerMissed={handleCanvasPointerDown}
      >
        <color attach="background" args={["#0b0f1a"]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[300, 450, 600]} intensity={0.9} />
        <directionalLight position={[-420, -320, 520]} intensity={0.45} />

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          panSpeed={0.6}
          zoomSpeed={0.7}
          maxDistance={2200}
          minDistance={240}
        />

        <gridHelper args={[2000, 40, "rgba(148,163,184,0.25)", "rgba(148,163,184,0.07)"]} />

        {edges.map((edge) => {
          const a = getPos(edge.source);
          const b = getPos(edge.target);
          const tone = edge.data?.tone ?? "default";
          const color =
            tone === "context"
              ? "rgba(34,197,94,0.55)"
              : tone === "edited"
                ? "rgba(249,115,22,0.65)"
                : "rgba(148,163,184,0.42)";
          return (
            <Line
              key={edge.id}
              points={[a, b]}
              color={color}
              lineWidth={1.25}
              transparent
              opacity={0.95}
            />
          );
        })}

        {nodes.map((node) => {
          const labelBase =
            typeof node.data?.title === "string" && node.data.title.trim().length > 0
              ? node.data.title
              : typeof node.data?.preview === "string"
                ? node.data.preview
                : node.id;
          const label = clampText(labelBase, 54);
          return (
            <DragNode
              key={node.id}
              nodeId={node.id}
              position={getPos(node.id)}
              size={getNodeSize(node)}
              fill={getNodeFill(node)}
              surface={getNodeSurface(node)}
              selected={node.id === selectedNodeId}
              label={label}
              onSelect={(id) => onSelectNode(id)}
              onMove={moveNode}
            />
          );
        })}
      </Canvas>

      <div className="pointer-events-none absolute bottom-5 left-5 z-10 hidden md:block">
        <div className="pointer-events-auto rounded-[18px] border border-white/70 bg-white/85 px-4 py-3 text-xs text-muted-foreground shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/85">
            3D Explore
          </p>
          <p className="mt-1 leading-5">
            Drag nodes to reposition. Hold{" "}
            <span className="font-semibold text-foreground">Shift</span> while dragging to adjust depth.
          </p>
        </div>
      </div>
    </div>
  );
}
