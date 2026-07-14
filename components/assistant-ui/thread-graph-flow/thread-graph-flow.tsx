"use client";

import "@xyflow/react/dist/style.css";
import { useAssistantRuntime } from "@assistant-ui/react";
import React from "react";
import { useThreadRepoItems } from "@/components/assistant-ui/use-thread-repo-items";
import { buildThreadGraphNodes } from "@/components/assistant-ui/thread-graph/build-graph-nodes";
import { buildThreadGraphExportText } from "@/components/assistant-ui/thread-graph/export-graph-json";
import { getEdgeKey } from "@/components/assistant-ui/thread-graph/graph-geometry";
import {
  CANVAS_BRANCH_RUN_NOTICE,
  CANVAS_PROMPT_DRAFT_NODE_ID,
  scrollMessageIntoView,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import { useCanvasRunManager } from "@/components/assistant-ui/thread-graph-flow/use-canvas-run-manager";
import { useCanvasBlockActions } from "@/components/assistant-ui/thread-graph-flow/use-canvas-block-actions";
import { useCanvasBranchSubmission } from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";
import { useCanvasSessionState } from "@/components/assistant-ui/thread-graph-flow/use-canvas-session-state";
import { useCanvasViewportController } from "@/components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller";
import { useCanvasGraphViewModel } from "@/components/assistant-ui/thread-graph-flow/use-canvas-graph-view-model";
import { useCanvasInspectorViewModel } from "@/components/assistant-ui/thread-graph-flow/use-canvas-inspector-view-model";
import { CanvasWorkspaceView } from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-view";
import {
  ROOT_NODE_ID,
  ROOT_NODE_LABEL,
  type EdgeConnectorInfo,
  type LinkConnectorPref,
  type Node as ThreadGraphNodeModel,
} from "@/components/assistant-ui/thread-graph/graph-types";
import { useGraphBranchIntent } from "@/components/context/graph-branch-intent";
import { useHistoryMode } from "@/components/context/history-mode";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useLinkEditor } from "@/components/context/link-editor";
import { useModelConfig } from "@/components/context/model-config";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useRequestError } from "@/components/context/request-error";
import { useSessionArtifacts } from "@/components/context/session-artifacts";
import { useSessionUiState } from "@/components/context/session-ui-state";
import {
  buildBranchSpec,
  getBranchOperationDetail,
} from "@/lib/thread-branching";
import { getContextBudgetPolicy } from "@/lib/context-budget";

export function ThreadGraphFlow() {
  const runtime = useAssistantRuntime();
  const { historyMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();
  const { activeSession, activeSessionId } = usePersistedSessions();
  const {
    canvasSelectionId,
    focusedMessageId,
    setCanvasSelectionId,
    setFocusedMessageId,
    setViewMode,
  } = useSessionUiState();
  const {
    artifacts: sessionArtifacts,
    canvasLinks,
    contextLinks,
    applyCompletedResponse,
    updateArtifactAndPersist,
    connectCanvasBlocks,
    createArtifact,
    deleteArtifact,
    getArtifactsForTarget,
    isArtifactLinkedToTarget,
    linkArtifactToTarget,
    removeCanvasLink,
    restoreArtifactRevision,
    setArtifactSyncMode,
    unlinkArtifactFromTarget,
    updateArtifact,
  } = useSessionArtifacts();
  const {
    items: repoItems,
    order: itemOrderMap,
    bridges: bridgeNodeIds,
  } = useThreadRepoItems(runtime, {
    defaultModel: { modelId, provider },
    persistedSnapshot: activeSession?.snapshot ?? null,
    sessionKey: activeSessionId,
  });
  const { cutLink, getParentId, overrides, resetLinks, restoreLink } = useLinkEditor();
  const {
    beginDraft,
    cancelDraft,
    draft,
    setDraftPosition,
    setDraftText,
    toggleDraftArtifact,
  } = useGraphBranchIntent();
  const [blockLibraryCollapsed, setBlockLibraryCollapsed] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const contextBudgetPolicy = React.useMemo(
    () => getContextBudgetPolicy({ modelId, provider }),
    [modelId, provider],
  );
  const imageUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const inspectorScrollRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarMenuRef = React.useRef<HTMLDivElement | null>(null);
  const flowViewportRef = React.useRef<HTMLDivElement | null>(null);


  const nodes = React.useMemo(
    () => buildThreadGraphNodes({ repoItems, bridgeNodeIds, getParentId }),
    [repoItems, bridgeNodeIds, getParentId],
  );
  const canvasConversationNodes = React.useMemo<ThreadGraphNodeModel[]>(() => {
    if (nodes.length > 0) return nodes;
    return [
      {
        id: ROOT_NODE_ID,
        parentId: null,
        role: "ROOT",
        text: ROOT_NODE_LABEL,
        depth: 0,
        idx: -1,
        branchId: null,
        isBridge: false,
        model: null,
        provider: null,
      },
    ];
  }, [nodes]);
  const nodeIndex = React.useMemo(
    () => new Map(canvasConversationNodes.map((node) => [node.id, node] as const)),
    [canvasConversationNodes],
  );
  const canvasPrompts = React.useMemo(
    () => sessionArtifacts.filter((artifact) => artifact.artifactType === "prompt"),
    [sessionArtifacts],
  );
  const artifacts = React.useMemo(
    () => sessionArtifacts.filter((artifact) => artifact.artifactType !== "prompt"),
    [sessionArtifacts],
  );
  const artifactIndex = React.useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact] as const)),
    [artifacts],
  );
  const promptIndex = React.useMemo(
    () => new Map(canvasPrompts.map((prompt) => [prompt.id, prompt] as const)),
    [canvasPrompts],
  );
  const {
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
  } = useCanvasSessionState({
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
  });
  const {
    activeCount: activeCanvasRunCount,
    cancelAll: cancelAllCanvasRuns,
    cancelPrompt: cancelCanvasPrompt,
    queuedCount: queuedCanvasRunCount,
    runPrompt: runCanvasPrompt,
  } = useCanvasRunManager({
    applyCompletedResponse,
    artifacts,
    canvasLinks,
    enabled: llmEnabled,
    maxConcurrent: 3,
    model: modelId,
    prompts: canvasPrompts,
    provider,
    updateArtifact,
    updateArtifactAndPersist,
  });
  React.useEffect(() => {
    if (!toolbarMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (toolbarMenuRef.current?.contains(target)) return;
      setToolbarMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [setToolbarMenu, toolbarMenu]);

  const selectedMessageNode = selectedNodeId ? nodeIndex.get(selectedNodeId) ?? null : null;
  const selectedArtifact = selectedNodeId ? artifactIndex.get(selectedNodeId) ?? null : null;
  const selectedOverride = selectedNodeId ? overrides.get(selectedNodeId) ?? null : null;
  const selectedParentId = selectedNodeId ? nodeIndex.get(selectedNodeId)?.parentId ?? null : null;
  const selectedContextArtifacts = React.useMemo(
    () => (selectedNodeId ? getArtifactsForTarget(selectedNodeId) : []),
    [getArtifactsForTarget, selectedNodeId],
  );
  const selectedContextArtifactIds = React.useMemo(
    () => new Set(selectedContextArtifacts.map((artifact) => artifact.id)),
    [selectedContextArtifacts],
  );
  const draftAnchorNode = React.useMemo(
    () => (draft ? nodeIndex.get(draft.anchorId) ?? null : null),
    [draft, nodeIndex],
  );
  const draftContextArtifacts = React.useMemo(() => {
    if (!draft) return [];
    if (draft.inputArtifactIds.length > 0) {
      const inputIds = new Set(draft.inputArtifactIds);
      return artifacts.filter((artifact) => inputIds.has(artifact.id));
    }
    return draftAnchorNode ? getArtifactsForTarget(draftAnchorNode.id) : [];
  }, [artifacts, draft, draftAnchorNode, getArtifactsForTarget]);
  const draftBranchSpec = React.useMemo(() => {
    if (!draftAnchorNode || !draft) return null;
    return buildBranchSpec(draftAnchorNode, draft.operation);
  }, [draft, draftAnchorNode]);
  const draftDetail = React.useMemo(
    () => (draft ? getBranchOperationDetail(draft.operation) : null),
    [draft],
  );
  const isThreadRunning = runtime.threads.main.getState().isRunning;
  const {
    canvasDraftError,
    handleCancelPromptDraft,
    handleCancelRun,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    setCanvasDraftError,
  } = useCanvasBranchSubmission({
    applyCompletedResponse,
    artifactIndex,
    cancelDraft,
    canvasConversationNodes,
    clearRequestError,
    draft,
    draftBranchSpec,
    draftContextArtifacts,
    historyMode,
    llmEnabled,
    modelId,
    provider,
    requestError,
    runtime,
    setRequestError,
  });

  const handleCutEdge = React.useCallback(
    (childId: string, parentId: string | null) => {
      cutLink(childId, parentId);
      applyCanvasSelection(childId);
    },
    [applyCanvasSelection, cutLink],
  );

  const handleNodeBranchOperation = React.useCallback(
    (nodeId: string, operation: Parameters<typeof beginDraft>[1]) => {
      const anchor = nodeIndex.get(nodeId);
      if (!anchor) return;
      clearRequestError();
      setCanvasDraftError(null);
      const initialText =
        anchor.role === "user" && operation !== "create-follow-up-prompt"
          ? anchor.text
          : "";
      beginDraft(anchor.id, operation, initialText);
      applyCanvasSelection(CANVAS_PROMPT_DRAFT_NODE_ID);
      setFlowRenderMode("2d");
    },
    [
      applyCanvasSelection,
      beginDraft,
      clearRequestError,
      nodeIndex,
      setCanvasDraftError,
      setFlowRenderMode,
    ],
  );

  const {
    decoratedFlowEdges,
    decoratedFlowNodes,
    filterCounts,
    flowNodeCount,
    graphStructureSignature,
    hiddenCanvasNodeCount,
    legendItems,
    selectedContextLinkedMessageIds,
    selectedFlowNode,
    treeStructureSignature,
    visibleCanvasNodeCount,
  } = useCanvasGraphViewModel({
    artifacts,
    artifactIndex,
    canvasConversationNodes,
    canvasLinks,
    canvasPrompts,
    cancelCanvasPrompt,
    canvasDraftError,
    contextLinks,
    deleteArtifact,
    densityMode,
    draft,
    draftAnchorNode,
    draftBranchSpec,
    draftContextCount: draftContextArtifacts.length,
    draftDetail,
    getArtifactsForTarget,
    handleCancelPromptDraft,
    handleNodeBranchOperation,
    handleCancelRun,
    handleCutEdge,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    isThreadRunning,
    legendNodes: nodes,
    linkEditMode,
    llmEnabled,
    nodeIndex,
    overrides,
    promptIndex,
    requestError,
    runCanvasPrompt,
    selectedArtifactId: selectedArtifact?.id ?? null,
    selectedContextArtifactIds,
    selectedNodeId,
    setDraftText,
    spotlight,
    updateArtifact,
  });

  const {
    handleFocusSelected,
    handleResetView,
    reactFlowInstance,
    setReactFlowInstance,
  } = useCanvasViewportController({
    decoratedNodeCount: decoratedFlowNodes.length,
    densityMode,
    draftActive: !!draft,
    flowRenderMode,
    focusedMessageId,
    nodeIndex,
    selectedNodeId,
    setStoredViewport,
    treeStructureSignature,
    visibleNodeCount: visibleCanvasNodeCount,
  });

  const exportConnectorDefaults = React.useMemo(() => {
    const defaults = new Map<string, LinkConnectorPref>();
    nodes.forEach((node) => {
      if (!node.parentId) return;
      defaults.set(getEdgeKey(node.parentId, node.id), {
        from: "right-1",
        to: "left-1",
      });
    });
    return defaults;
  }, [nodes]);

  const exportEdgeConnectorMap = React.useMemo(() => {
    const connectorMap = new Map<string, EdgeConnectorInfo>();
    nodes.forEach((node) => {
      if (!node.parentId) return;
      connectorMap.set(getEdgeKey(node.parentId, node.id), {
        from: "right-1",
        to: "left-1",
        parentId: node.parentId,
        childId: node.id,
        points: {
          from: { x: 0, y: 0 },
          to: { x: 0, y: 0 },
        },
      });
    });
    return connectorMap;
  }, [nodes]);

  const handleCopyJson = React.useCallback(async () => {
    try {
      const text = buildThreadGraphExportText({
        artifacts,
        bridgeNodeIds,
        connectorDefaults: exportConnectorDefaults,
        contextLinks,
        edgeConnectorMap: exportEdgeConnectorMap,
        getEdgeKey,
        getParentId,
        itemOrderMap,
        linkConnectors: new Map(),
        repoItems,
      });
      await navigator.clipboard.writeText(text);
      alert("Graph JSON copied to clipboard");
    } catch (error) {
      console.error(error);
      alert("Copy failed");
    }
  }, [
    artifacts,
    bridgeNodeIds,
    contextLinks,
    exportConnectorDefaults,
    exportEdgeConnectorMap,
    getParentId,
    itemOrderMap,
    repoItems,
  ]);

  const interactiveFlowNodes = React.useMemo(
    () =>
      decoratedFlowNodes.map((node) =>
        node.id === ROOT_NODE_ID
          ? {
              ...node,
              data: {
                ...node.data,
                onCopyGraphJson: handleCopyJson,
                onToggleLinkEdit: () => setLinkEditMode((current) => !current),
              },
            }
          : node,
      ),
    [decoratedFlowNodes, handleCopyJson, setLinkEditMode],
  );

  const handleOpenSelectedInChat = React.useCallback(() => {
    if (!selectedMessageNode || selectedMessageNode.id === ROOT_NODE_ID) return;
    setViewMode("split");
    setFocusedMessageId(selectedMessageNode.id);
    scrollMessageIntoView(selectedMessageNode.id);
  }, [selectedMessageNode, setFocusedMessageId, setViewMode]);

  const handleRestoreSelected = React.useCallback(() => {
    if (!selectedNodeId || !overrides.has(selectedNodeId)) return;
    restoreLink(selectedNodeId);
  }, [overrides, restoreLink, selectedNodeId]);

  const handleCutSelected = React.useCallback(() => {
    if (!selectedNodeId || !selectedParentId) return;
    cutLink(selectedNodeId, selectedParentId);
  }, [cutLink, selectedNodeId, selectedParentId]);

  const handleChooseBranchOperation = React.useCallback(
    (operation: Parameters<typeof beginDraft>[1]) => {
      if (!selectedMessageNode) return;
      clearRequestError();
      setCanvasDraftError(null);
      const initialText =
        selectedMessageNode.role === "user" && operation !== "create-follow-up-prompt"
          ? selectedMessageNode.text
          : "";
      beginDraft(selectedMessageNode.id, operation, initialText);
      setFlowRenderMode("2d");
    },
    [
      beginDraft,
      clearRequestError,
      selectedMessageNode,
      setCanvasDraftError,
      setFlowRenderMode,
    ],
  );

  const {
    handleAddCanvasBlock,
    handleArtifactConnectFromInspector,
    handleCanvasConnect,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCreatePromptNode,
    handleFileUploadChange,
    handleImageUploadChange,
    handleToggleArtifactLink,
  } = useCanvasBlockActions({
    activeSessionId,
    artifacts,
    artifactIndex,
    canvasPrompts,
    clearRequestError,
    connectCanvasBlocks,
    contextBudgetPolicy,
    createArtifact,
    draft,
    fileUploadInputRef,
    flowViewportRef,
    imageUploadInputRef,
    isArtifactLinkedToTarget,
    linkArtifactToTarget,
    nodeIndex,
    promptIndex,
    reactFlowInstance,
    selectedArtifact,
    setCanvasDraftError,
    setCanvasSelectionId,
    setConnectionError,
    setFlowRenderMode,
    setFocusedMessageId,
    setRequestError,
    setSelectedNodeId,
    toggleDraftArtifact,
    unlinkArtifactFromTarget,
    updateArtifact,
  });

  const {
    attachableTargets,
    selectedArtifactLineCount,
    selectedArtifactPreviewSize,
    selectedArtifactSize,
    selectedArtifactStatChips,
    selectedBranchOptions,
    selectedBranchPathLabel,
    selectedCanvasLabel,
    selectedCanvasPreview,
    selectedPreview,
    showCanvasPromptCta,
    showInspector,
  } = useCanvasInspectorViewModel({
    canvasConversationNodes,
    draft,
    inspectorScrollRef,
    linkEditMode,
    nodeIndex,
    resetLinkCount: overrides.size,
    selectedArtifact,
    selectedContextArtifacts,
    selectedFlowNode,
    selectedMessageNode,
    selectedNodeId,
  });

  return (
    <CanvasWorkspaceView
      imageUploadInputRef={imageUploadInputRef}
      fileUploadInputRef={fileUploadInputRef}
      onImageUploadChange={handleImageUploadChange}
      onFileUploadChange={handleFileUploadChange}
      inspectorScrollRef={inspectorScrollRef}
      blockLibraryProps={{
        collapsed: blockLibraryCollapsed,
        onAddBlock: handleAddCanvasBlock,
        onCollapsedChange: setBlockLibraryCollapsed,
      }}
      sidebarProps={{
        activeCanvasRunCount,
        artifactCount: artifacts.length,
        connectionError,
        densityMode,
        filterCounts,
        flowNodeCount,
        flowRenderMode,
        hiddenCanvasNodeCount,
        legendItems,
        linkEditMode,
        onCancelAllRuns: cancelAllCanvasRuns,
        onCopyJson: handleCopyJson,
        onCreatePrompt: () => handleCreatePromptNode(),
        onDensityModeChange: setDensityMode,
        onFlowRenderModeChange: setFlowRenderMode,
        onLinkEditModeChange: setLinkEditMode,
        onResetLinks: resetLinks,
        onSpotlightChange: setSpotlight,
        onToolbarMenuChange: setToolbarMenu,
        promptDisabled: !llmEnabled,
        queuedCanvasRunCount,
        resetLinkCount: overrides.size,
        selectedBranchPathLabel,
        selectedCanvasLabel,
        selectedCanvasPreview,
        selectedNodeId,
        showCanvasPromptCta,
        showInspector: false,
        spotlight,
        toolbarMenu,
        toolbarMenuRef,
        visibleCanvasNodeCount,
      }}
      artifactInspectorProps={
        selectedArtifact
          ? {
              artifact: selectedArtifact,
              artifactLineCount: selectedArtifactLineCount,
              artifactPreviewSize: selectedArtifactPreviewSize,
              artifactSize: selectedArtifactSize,
              artifactStatChips: selectedArtifactStatChips,
              attachableTargets,
              contextBudgetMaxImagePreviewBytes:
                contextBudgetPolicy.maxImagePreviewBytes,
              hasOutputLink: canvasLinks.some(
                (link) =>
                  link.relation === "output" &&
                  link.artifactId === selectedArtifact.id,
              ),
              isLinkedToTarget: (targetId) =>
                isArtifactLinkedToTarget(selectedArtifact.id, targetId),
              linkedTargetCount: selectedContextLinkedMessageIds.size,
              onConnectTo: handleArtifactConnectFromInspector,
              onDelete: () => {
                deleteArtifact(selectedArtifact.id);
                applyCanvasSelection(null);
              },
              onDisconnectOutput: () => {
                const outputLink = canvasLinks.find(
                  (link) =>
                    link.relation === "output" &&
                    link.artifactId === selectedArtifact.id,
                );
                if (outputLink) removeCanvasLink(outputLink.id);
              },
              onOpenTarget: applyCanvasSelection,
              onRestoreRevision: (revisionId) =>
                restoreArtifactRevision(selectedArtifact.id, revisionId),
              onToggleLink: (targetId) =>
                handleToggleArtifactLink(selectedArtifact.id, targetId),
              onToggleSync: () =>
                setArtifactSyncMode(
                  selectedArtifact.id,
                  selectedArtifact.syncMode === "paused" ? "auto" : "paused",
                ),
              onUpdate: (patch) => updateArtifact(selectedArtifact.id, patch),
            }
          : null
      }
      messageInspectorProps={
        selectedFlowNode && selectedMessageNode
          ? {
              activeDraft:
                draft && draft.anchorId === selectedMessageNode.id
                  ? { operation: draft.operation, text: draft.text }
                  : null,
              artifacts,
              busy: isSubmittingBranch,
              contextCount: selectedContextArtifacts.length,
              details: selectedBranchOptions,
              disabled: !llmEnabled,
              isLinkedToTarget: (artifactId) =>
                isArtifactLinkedToTarget(artifactId, selectedMessageNode.id),
              linkEditMode,
              onCancelDraft: handleCancelPromptDraft,
              onCancelRun: isThreadRunning ? handleCancelRun : undefined,
              onChooseOperation: handleChooseBranchOperation,
              onClearFocus: () => applyCanvasSelection(null),
              onCutSelected: handleCutSelected,
              onDraftTextChange: setDraftText,
              onFocusSelected: handleFocusSelected,
              onOpenInChat: handleOpenSelectedInChat,
              onResetView: handleResetView,
              onRestoreSelected: handleRestoreSelected,
              onSubmitDraft: handleSubmitBranchDraft,
              onToggleArtifactLink: (artifactId) =>
                handleToggleArtifactLink(artifactId, selectedMessageNode.id),
              runInterruptionNote: isThreadRunning
                ? CANVAS_BRANCH_RUN_NOTICE
                : null,
              selectedBranchPathLabel,
              selectedFlowNode,
              selectedNodeId,
              selectedOverride: !!selectedOverride,
              selectedParentId,
              selectedPreview,
            }
          : null
      }
      stageProps={{
        activeSessionId,
        edges: decoratedFlowEdges,
        flowRenderMode,
        graphStructureSignature,
        nodes: interactiveFlowNodes,
        onArtifactPositionChange: (artifactId, position) =>
          updateArtifact(artifactId, { position }),
        onCanvasConnect: handleCanvasConnect,
        onCanvasDragOver: handleCanvasDragOver,
        onCanvasDrop: handleCanvasDrop,
        onDraftPositionChange: setDraftPosition,
        onInit: setReactFlowInstance,
        onMessageOpen: (messageId) => {
          applyCanvasSelection(messageId);
          setViewMode("split");
          scrollMessageIntoView(messageId);
        },
        onFlowRenderModeChange: setFlowRenderMode,
        onNodeSelect: applyCanvasSelection,
        onViewportChange: setStoredViewport,
        selectedNodeId,
        storedViewport,
        viewportRef: flowViewportRef,
      }}
    />
  );
}
