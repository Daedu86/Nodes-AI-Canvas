"use client";

import dynamic from "next/dynamic";
import React from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { ArtifactGraphNode } from "@/components/assistant-ui/thread-graph-flow/artifact-node";
import { CanvasPromptNode } from "@/components/assistant-ui/thread-graph-flow/canvas-prompt-node";
import { ThreadGraphEdge } from "@/components/assistant-ui/thread-graph-flow/thread-graph-edge";
import { ThreadGraphNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-node";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import {
  isFlowViewport,
  type FlowRenderMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import { ROOT_NODE_ID } from "@/components/assistant-ui/thread-graph/graph-types";

const ThreadGraph3D = dynamic(
  () =>
    import("@/components/assistant-ui/thread-graph-flow/thread-graph-3d").then(
      (module) => module.ThreadGraph3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" className="flex h-full min-h-[28rem] items-center justify-center rounded-[32px] border border-white/70 bg-background/80 text-sm text-muted-foreground dark:border-white/10">
        Loading 3D canvas…
      </div>
    ),
  },
);

const nodeTypes: NodeTypes = {
  artifactNode: ArtifactGraphNode,
  promptNode: CanvasPromptNode,
  threadNode: ThreadGraphNode,
};

const edgeTypes: EdgeTypes = {
  threadEdge: ThreadGraphEdge,
};

type CanvasStageProps = {
  activeSessionId: string | null;
  edges: ThreadGraphFlowEdge[];
  flowRenderMode: FlowRenderMode;
  graphStructureSignature: string;
  nodes: ThreadGraphFlowNode[];
  onArtifactPositionChange: (
    artifactId: string,
    position: { x: number; y: number },
  ) => void;
  onCanvasConnect: (connection: Connection) => void;
  onCanvasDragOver: React.DragEventHandler<HTMLDivElement>;
  onCanvasDrop: React.DragEventHandler<HTMLDivElement>;
  onDraftPositionChange: (position: { x: number; y: number }) => void;
  onInit: (
    instance: ReactFlowInstance<ThreadGraphFlowNode, ThreadGraphFlowEdge>,
  ) => void;
  onMessageOpen: (messageId: string) => void;
  onFlowRenderModeChange: (mode: FlowRenderMode) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onViewportChange: (viewport: Viewport) => void;
  selectedNodeId: string | null;
  storedViewport: Viewport | null;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

export function CanvasStage({
  activeSessionId,
  edges,
  flowRenderMode,
  graphStructureSignature,
  nodes,
  onArtifactPositionChange,
  onCanvasConnect,
  onCanvasDragOver,
  onCanvasDrop,
  onDraftPositionChange,
  onInit,
  onMessageOpen,
  onFlowRenderModeChange,
  onNodeSelect,
  onViewportChange,
  selectedNodeId,
  storedViewport,
  viewportRef,
}: CanvasStageProps) {
  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label="Conversation canvas"
      aria-describedby="canvas-stage-instructions"
      className="relative min-h-[28rem] flex-1 lg:min-h-0"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <div role="group" aria-label="Canvas render mode" className="absolute right-5 top-5 z-20 flex items-center rounded-full border border-white/70 bg-white/92 p-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/92">
        {(["2d", "3d"] as FlowRenderMode[]).map((mode) => (
          <button key={mode} type="button" aria-pressed={flowRenderMode === mode} onClick={() => onFlowRenderModeChange(mode)} className={`rounded-full px-3 py-2 transition-colors ${flowRenderMode === mode ? "bg-foreground text-background" : "hover:text-foreground"}`}>
            {mode.toUpperCase()}
          </button>
        ))}
      </div>
      <p id="canvas-stage-instructions" className="sr-only">
        Use Tab to reach canvas controls and graph elements. Select a node to inspect it. Double-click a conversation node to open it in Chat.
      </p>
      {flowRenderMode === "3d" ? (
        <ThreadGraph3D
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={onNodeSelect}
        />
      ) : (
        <>
          <ReactFlow
            key={`flow:${activeSessionId}`}
            aria-label="Conversation graph"
            data-graph-structure={graphStructureSignature}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView={!isFlowViewport(storedViewport)}
            defaultViewport={storedViewport ?? { x: 0, y: 0, zoom: 1 }}
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.3}
            maxZoom={1.6}
            onlyRenderVisibleElements={nodes.length > 200}
            nodesDraggable
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onInit={onInit}
            onConnect={onCanvasConnect}
            onMoveEnd={(_, viewport) => onViewportChange(viewport)}
            onNodeDragStop={(_, node) => {
              const position = {
                x: node.position.x,
                y: node.position.y,
              };
              if (
                node.data?.kind === "artifact" ||
                node.data?.kind === "canvas-prompt"
              ) {
                onArtifactPositionChange(node.id, position);
              } else if (node.data?.kind === "prompt-draft") {
                onDraftPositionChange(position);
              }
            }}
            onSelectionChange={({ nodes: selectedNodes }) => {
              if (selectedNodes[0]?.id) {
                onNodeSelect(selectedNodes[0].id);
              }
            }}
            onNodeClick={(_, node) => onNodeSelect(node.id)}
            onNodeDoubleClick={(_, node) => {
              if (
                node.data.kind === "artifact" ||
                node.data.kind === "canvas-prompt" ||
                node.id === ROOT_NODE_ID
              ) {
                return;
              }
              onNodeSelect(node.id);
              onMessageOpen(node.id);
            }}
            onPaneClick={() => onNodeSelect(null)}
            className="overflow-hidden rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.06),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.92))] shadow-[0_30px_110px_-60px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.92))]"
            defaultEdgeOptions={{ animated: false }}
          >
            <Background
              color="rgba(148,163,184,0.18)"
              gap={24}
              size={1.15}
            />
            <MiniMap
              pannable
              zoomable
              className="!pointer-events-none !bottom-5 !right-5 !rounded-[20px] !border !border-white/70 !bg-white/85 !shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] dark:!border-white/10 dark:!bg-slate-950/85"
              nodeColor={(node) =>
                String(
                  (node.data as { accent?: string } | undefined)?.accent ??
                    "rgba(100,116,139,0.85)",
                )
              }
              maskColor="rgba(15,23,42,0.05)"
            />
            <Controls
              className="!bottom-5 !left-5 !right-auto !top-auto [&>button]:!border-white/70 [&>button]:!bg-white/92 [&>button]:!text-foreground [&>button]:!shadow-sm dark:[&>button]:!border-white/10 dark:[&>button]:!bg-slate-950/92"
              showInteractive={false}
            />
          </ReactFlow>
          <div className="pointer-events-none absolute bottom-5 left-20 z-10 hidden items-center gap-2 md:flex">
            <div className="pointer-events-none rounded-full border border-white/70 bg-white/82 px-3 py-1 text-[11px] text-muted-foreground shadow-[0_18px_48px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
              Drag nodes directly on the stage. The canvas is the main workspace.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
