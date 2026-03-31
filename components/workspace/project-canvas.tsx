"use client";

import React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArtifactGraphNode } from "@/components/assistant-ui/thread-graph-flow/artifact-node";
import { ThreadGraphEdge } from "@/components/assistant-ui/thread-graph-flow/thread-graph-edge";
import { ThreadGraphNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-node";
import type { ProjectDocument } from "@/lib/project-documents";
import type { ProjectMemoryItem } from "@/lib/memory-documents";
import type { SessionDocument } from "@/lib/session-documents";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import { buildProjectCanvasFlow } from "@/components/workspace/project-canvas-data";

export type ProjectCanvasSelection =
  | {
      kind: "edge";
      label: string;
      preview: string;
      sessionId: string | null;
    }
  | {
      kind: "node";
      label: string;
      memoryId?: string | null;
      memoryType?: string | null;
      preview: string;
      role: string;
      sessionId: string | null;
      sessionTitle: string | null;
    }
  | null;

const nodeTypes = {
  artifactNode: ArtifactGraphNode,
  threadNode: ThreadGraphNode,
};

const edgeTypes = {
  threadEdge: ThreadGraphEdge,
};

function ProjectCanvasInner({
  project,
  sessions,
  memoryItems,
  onSelectionChange,
}: {
  project: ProjectDocument;
  sessions: SessionDocument[];
  memoryItems: ProjectMemoryItem[];
  onSelectionChange?: (selection: ProjectCanvasSelection) => void;
}) {
  const flow = React.useMemo(() => buildProjectCanvasFlow(project, sessions, memoryItems), [memoryItems, project, sessions]);
  const nodes = React.useMemo(
    () => flow.nodes.map((node) => ({ ...node, draggable: false })) satisfies ThreadGraphFlowNode[],
    [flow.nodes],
  );
  const edges = React.useMemo(
    () => flow.edges.map((edge) => ({ ...edge, selectable: true })) satisfies ThreadGraphFlowEdge[],
    [flow.edges],
  );

  const handleNodeClick = React.useCallback<NodeMouseHandler<ThreadGraphFlowNode>>((_, node) => {
    onSelectionChange?.({
      kind: "node",
      label: node.data.title ?? node.data.sessionTitle ?? node.data.role,
      memoryId: node.data.memoryId ?? null,
      memoryType: node.data.memoryType ?? null,
      preview: node.data.preview,
      role: node.data.role,
      sessionId: node.data.sessionId ?? null,
      sessionTitle: node.data.sessionTitle ?? null,
    });
  }, [onSelectionChange]);

  const handleEdgeClick = React.useCallback<EdgeMouseHandler<ThreadGraphFlowEdge>>((_, edge) => {
    onSelectionChange?.({
      kind: "edge",
      label: edge.data?.label ?? "Branch",
      preview:
        edge.data?.tone === "context"
          ? "Global project context flowing into a session cluster."
          : "Tree connection between two messages inside the same session.",
      sessionId: null,
    });
  }, [onSelectionChange]);

  return (
    <ReactFlow
      key={`${project.id}:${project.sessionIds.join(",")}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ duration: 300, padding: 0.18 }}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={() => onSelectionChange?.(null)}
      colorMode="light"
      className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.12),transparent_34%),linear-gradient(180deg,rgba(248,250,252,1),rgba(241,245,249,0.92))]"
      defaultEdgeOptions={{ zIndex: 1 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.25}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      panOnDrag
      zoomOnScroll
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(15,23,42,0.12)" />
      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        className="!h-28 !w-44 !rounded-2xl !border !border-border/70 !bg-background/90 !shadow-sm"
        nodeColor={(node) => (typeof node.data?.accent === "string" ? node.data.accent : "#94a3b8")}
      />
      <Controls className="!border !border-border/70 !bg-background/90 !shadow-sm" />
    </ReactFlow>
  );
}

export function ProjectCanvas({
  project,
  sessions,
  memoryItems,
  onSelectionChange,
}: {
  project: ProjectDocument;
  sessions: SessionDocument[];
  memoryItems: ProjectMemoryItem[];
  onSelectionChange?: (selection: ProjectCanvasSelection) => void;
}) {
  return (
    <ReactFlowProvider>
      <ProjectCanvasInner
        project={project}
        sessions={sessions}
        memoryItems={memoryItems}
        onSelectionChange={onSelectionChange}
      />
    </ReactFlowProvider>
  );
}
