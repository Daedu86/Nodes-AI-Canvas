"use client";

import type { Viewport } from "@xyflow/react";
import React from "react";
import type { GraphBranchIntent } from "@/components/context/graph-branch-intent";
import {
  readFlowViewport,
  writeFlowViewport,
} from "@/components/assistant-ui/thread-graph/graph-storage";
import {
  CANVAS_PROMPT_DRAFT_NODE_ID,
  isFlowViewport,
  readFlowRenderMode,
  type FlowDensityMode,
  type FlowRenderMode,
  type FlowSpotlightMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import {
  ROOT_NODE_ID,
  type Node as ThreadGraphNodeModel,
} from "@/components/assistant-ui/thread-graph/graph-types";
import type { SessionArtifact } from "@/lib/session-artifacts";

type CanvasToolbarMenu = "add" | "tools" | null;

type UseCanvasSessionStateOptions = {
  activeSessionId: string | null | undefined;
  artifactIndex: ReadonlyMap<string, SessionArtifact>;
  cancelDraft: () => void;
  canvasSelectionId: string | null;
  draft: GraphBranchIntent | null;
  focusedMessageId: string | null;
  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;
  promptIndex: ReadonlyMap<string, SessionArtifact>;
  setCanvasSelectionId: (value: string | null) => void;
  setFocusedMessageId: (value: string | null) => void;
};

type ResolveCanvasFocusedMessageIdOptions = {
  nodeId: string | null;
  hasArtifact: boolean;
  hasConversationNode: boolean;
  hasPrompt: boolean;
};

export const getCanvasFlowRenderModeStorageKey = (
  activeSessionId: string | null | undefined,
) => `nodes.canvas.render-mode.v1:${activeSessionId ?? "unknown"}`;

export function resolveCanvasFocusedMessageId({
  nodeId,
  hasArtifact,
  hasConversationNode,
  hasPrompt,
}: ResolveCanvasFocusedMessageIdOptions): string | null | undefined {
  if (!nodeId || nodeId === ROOT_NODE_ID || nodeId === CANVAS_PROMPT_DRAFT_NODE_ID) {
    return null;
  }
  if (hasArtifact || hasPrompt) return null;
  if (hasConversationNode) return nodeId;
  return undefined;
}

export function useCanvasSessionState({
  activeSessionId,
  artifactIndex,
  cancelDraft,
  canvasSelectionId,
  draft,
  focusedMessageId,
  nodeIndex,
  promptIndex,
  setCanvasSelectionId,
  setFocusedMessageId,
}: UseCanvasSessionStateOptions) {
  const [linkEditMode, setLinkEditMode] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState<FlowSpotlightMode>("all");
  const [densityMode, setDensityMode] = React.useState<FlowDensityMode>("overview");
  const [toolbarMenu, setToolbarMenu] = React.useState<CanvasToolbarMenu>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [flowRenderMode, setFlowRenderMode] = React.useState<FlowRenderMode>("2d");
  const [storedViewport, setStoredViewport] = React.useState<Viewport | null>(() =>
    readFlowViewport(activeSessionId),
  );
  const treeSignatureRef = React.useRef<string | null>(null);
  const flowRenderModeKey = React.useMemo(
    () => getCanvasFlowRenderModeStorageKey(activeSessionId),
    [activeSessionId],
  );

  React.useEffect(() => {
    setFlowRenderMode(readFlowRenderMode(flowRenderModeKey));
  }, [flowRenderModeKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(flowRenderModeKey, flowRenderMode);
    } catch {
      // ignore storage errors
    }
  }, [flowRenderMode, flowRenderModeKey]);

  React.useEffect(() => {
    setStoredViewport(readFlowViewport(activeSessionId));
    setSelectedNodeId(null);
    setCanvasSelectionId(null);
    setLinkEditMode(false);
    setToolbarMenu(null);
    setSpotlight("all");
    setDensityMode("overview");
    treeSignatureRef.current = null;
    cancelDraft();
  }, [activeSessionId, cancelDraft, setCanvasSelectionId]);

  React.useEffect(() => {
    if (
      draft &&
      selectedNodeId &&
      selectedNodeId !== CANVAS_PROMPT_DRAFT_NODE_ID &&
      draft.anchorId !== selectedNodeId
    ) {
      cancelDraft();
    }
  }, [cancelDraft, draft, selectedNodeId]);

  React.useEffect(() => {
    if (isFlowViewport(storedViewport)) {
      writeFlowViewport(storedViewport, activeSessionId);
    }
  }, [activeSessionId, storedViewport]);

  const applyCanvasSelection = React.useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      setCanvasSelectionId(nodeId);
      const nextFocusedMessageId = resolveCanvasFocusedMessageId({
        nodeId,
        hasArtifact: !!nodeId && artifactIndex.has(nodeId),
        hasConversationNode: !!nodeId && nodeIndex.has(nodeId),
        hasPrompt: !!nodeId && promptIndex.has(nodeId),
      });
      if (nextFocusedMessageId !== undefined) {
        setFocusedMessageId(nextFocusedMessageId);
      }
    },
    [artifactIndex, nodeIndex, promptIndex, setCanvasSelectionId, setFocusedMessageId],
  );

  React.useEffect(() => {
    if (!focusedMessageId || focusedMessageId === selectedNodeId) return;
    if (!nodeIndex.has(focusedMessageId)) return;
    setSelectedNodeId(focusedMessageId);
  }, [focusedMessageId, nodeIndex, selectedNodeId]);

  React.useEffect(() => {
    if (!canvasSelectionId || canvasSelectionId === selectedNodeId) return;
    if (
      !nodeIndex.has(canvasSelectionId) &&
      !artifactIndex.has(canvasSelectionId) &&
      !promptIndex.has(canvasSelectionId)
    ) {
      return;
    }
    applyCanvasSelection(canvasSelectionId);
  }, [
    applyCanvasSelection,
    artifactIndex,
    canvasSelectionId,
    nodeIndex,
    promptIndex,
    selectedNodeId,
  ]);

  React.useEffect(() => {
    if (densityMode === "focus" && !selectedNodeId) {
      setDensityMode("overview");
    }
  }, [densityMode, selectedNodeId]);

  return {
    applyCanvasSelection,
    densityMode,
    flowRenderMode,
    linkEditMode,
    selectedNodeId,
    setDensityMode,
    setFlowRenderMode,
    setLinkEditMode,
    setSelectedNodeId,
    setSpotlight,
    setStoredViewport,
    setToolbarMenu,
    spotlight,
    storedViewport,
    toolbarMenu,
    treeSignatureRef,
  };
}
