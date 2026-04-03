"use client";

import React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from "@xyflow/react";
import { BookCopy, Focus, Layers3, MessageSquareText, RefreshCw } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
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
      messageId?: string | null;
      memoryId?: string | null;
      memoryType?: string | null;
      preview: string;
      role: string;
      sessionId: string | null;
      sessionTitle: string | null;
    }
  | null;

type ProjectCanvasFilter = "all" | "conversation" | "typed" | "context";

const nodeTypes = {
  artifactNode: ArtifactGraphNode,
  threadNode: ThreadGraphNode,
};

const edgeTypes = {
  threadEdge: ThreadGraphEdge,
};

const PROJECT_CANVAS_FILTER_META: Record<
  ProjectCanvasFilter,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  all: { label: "All", icon: Layers3 },
  conversation: { label: "Conversation", icon: MessageSquareText },
  typed: { label: "Typed nodes", icon: BookCopy },
  context: { label: "Context", icon: Focus },
};

const isConversationNode = (node: ThreadGraphFlowNode) =>
  node.data.role !== "global-context" && node.data.role !== "memory";

const matchesCanvasFilter = (node: ThreadGraphFlowNode, filter: ProjectCanvasFilter) => {
  switch (filter) {
    case "conversation":
      return isConversationNode(node);
    case "typed":
      return node.data.role === "memory";
    case "context":
      return node.data.role === "global-context";
    default:
      return true;
  }
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
  const reactFlow = useReactFlow<ThreadGraphFlowNode, ThreadGraphFlowEdge>();
  const flow = React.useMemo(() => buildProjectCanvasFlow(project, sessions, memoryItems), [memoryItems, project, sessions]);
  const nodes = React.useMemo(
    () => flow.nodes.map((node) => ({ ...node, draggable: false })) satisfies ThreadGraphFlowNode[],
    [flow.nodes],
  );
  const edges = React.useMemo(
    () => flow.edges.map((edge) => ({ ...edge, selectable: true })) satisfies ThreadGraphFlowEdge[],
    [flow.edges],
  );
  const [canvasFilter, setCanvasFilter] = React.useState<ProjectCanvasFilter>("all");
  const [focusSessionId, setFocusSessionId] = React.useState<string | null>(null);
  const [localSelection, setLocalSelection] = React.useState<ProjectCanvasSelection>(null);
  const projectSessionIdsKey = React.useMemo(() => project.sessionIds.join("|"), [project.sessionIds]);

  React.useEffect(() => {
    setCanvasFilter("all");
    setFocusSessionId(null);
    setLocalSelection(null);
  }, [project.id, projectSessionIdsKey]);

  const sessionTitleById = React.useMemo(
    () => new Map(sessions.map((session) => [session.id, session.title?.trim() || "Untitled Session"])),
    [sessions],
  );

  const filterCounts = React.useMemo(
    () => ({
      all: nodes.length,
      context: nodes.filter((node) => matchesCanvasFilter(node, "context")).length,
      conversation: nodes.filter((node) => matchesCanvasFilter(node, "conversation")).length,
      typed: nodes.filter((node) => matchesCanvasFilter(node, "typed")).length,
    }),
    [nodes],
  );

  const visibleNodes = React.useMemo(
    () =>
      nodes.filter((node) => {
        if (!matchesCanvasFilter(node, canvasFilter)) {
          return false;
        }
        if (!focusSessionId) {
          return true;
        }
        if (node.data.role === "global-context") {
          return true;
        }
        return node.data.sessionId === focusSessionId;
      }),
    [canvasFilter, focusSessionId, nodes],
  );

  const visibleNodeIds = React.useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = React.useMemo(
    () => edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    [edges, visibleNodeIds],
  );

  const selectedSessionId = localSelection?.kind === "node" ? localSelection.sessionId ?? null : null;
  const focusedSessionTitle = focusSessionId ? sessionTitleById.get(focusSessionId) ?? "Focused session" : null;

  React.useEffect(() => {
    if (visibleNodes.length === 0) return;
    const timeout = window.setTimeout(() => {
      void reactFlow.fitView({
        duration: 250,
        padding: focusSessionId ? 0.24 : 0.18,
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [canvasFilter, focusSessionId, project.id, reactFlow, visibleNodes.length]);

  const handleNodeClick = React.useCallback<NodeMouseHandler<ThreadGraphFlowNode>>((_, node) => {
    const selection: ProjectCanvasSelection = {
      kind: "node",
      label: node.data.title ?? node.data.sessionTitle ?? node.data.role,
      messageId: node.data.messageId ?? null,
      memoryId: node.data.memoryId ?? null,
      memoryType: node.data.memoryType ?? null,
      preview: node.data.preview,
      role: node.data.role,
      sessionId: node.data.sessionId ?? null,
      sessionTitle: node.data.sessionTitle ?? null,
    };
    setLocalSelection(selection);
    onSelectionChange?.(selection);
  }, [onSelectionChange]);

  const handleEdgeClick = React.useCallback<EdgeMouseHandler<ThreadGraphFlowEdge>>((_, edge) => {
    const selection: ProjectCanvasSelection = {
      kind: "edge",
      label: edge.data?.label ?? "Branch",
      preview:
        edge.data?.tone === "context"
          ? "Global project context flowing into a session cluster."
          : "Tree connection between two messages inside the same session.",
      sessionId: null,
    };
    setLocalSelection(selection);
    onSelectionChange?.(selection);
  }, [onSelectionChange]);

  const handlePaneClick = React.useCallback(() => {
    setLocalSelection(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  const handleFocusSelectedSession = React.useCallback(() => {
    if (!selectedSessionId) return;
    setFocusSessionId(selectedSessionId);
  }, [selectedSessionId]);

  const handleResetView = React.useCallback(() => {
    setCanvasFilter("all");
    setFocusSessionId(null);
    window.setTimeout(() => {
      void reactFlow.fitView({ duration: 250, padding: 0.18 });
    }, 60);
  }, [reactFlow]);

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute right-4 top-4 z-10 w-[min(360px,calc(100%-2rem))]">
        <div className="pointer-events-none rounded-2xl border border-border/70 bg-background/90 p-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Canvas Guide
              </p>
              <p className="text-sm font-medium text-foreground">
                {focusedSessionTitle ? `Focused on ${focusedSessionTitle}` : "Reading the whole project graph"}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Filter the canvas by structure, then focus a selected session when the graph gets dense.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="pointer-events-auto h-8 px-2" onClick={handleResetView}>
              <RefreshCw className="h-3.5 w-3.5" />
              Reset view
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.entries(PROJECT_CANVAS_FILTER_META) as Array<
              [ProjectCanvasFilter, (typeof PROJECT_CANVAS_FILTER_META)[ProjectCanvasFilter]]
            >).map(([filter, meta]) => {
              const Icon = meta.icon;
              const active = canvasFilter === filter;
              return (
                <Button
                  key={filter}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="pointer-events-auto h-8 px-3"
                  onClick={() => setCanvasFilter(filter)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] leading-none text-current">
                    {filterCounts[filter]}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
              {visibleNodes.length} nodes visible
            </span>
            {localSelection ? (
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                Selected: {localSelection.label}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto h-8 px-2"
              onClick={handleFocusSelectedSession}
              disabled={!selectedSessionId}
            >
              <Focus className="h-3.5 w-3.5" />
              Focus selected session
            </Button>
            {focusSessionId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-auto h-8 px-2"
                onClick={() => setFocusSessionId(null)}
              >
                Show all sessions
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ReactFlow
        key={`${project.id}:${project.sessionIds.join(",")}`}
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ duration: 300, padding: 0.18 }}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
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
          className="!h-32 !w-52 !rounded-2xl !border !border-border/70 !bg-background/90 !shadow-lg"
          nodeColor={(node) => (typeof node.data?.accent === "string" ? node.data.accent : "#94a3b8")}
        />
        <Controls className="!border !border-border/70 !bg-background/90 !shadow-sm" />
      </ReactFlow>
    </div>
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
