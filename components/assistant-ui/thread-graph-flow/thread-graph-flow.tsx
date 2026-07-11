"use client";

import "@xyflow/react/dist/style.css";
import { useAssistantRuntime } from "@assistant-ui/react";
import {
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import React from "react";
import { useThreadRepoItems } from "@/components/assistant-ui/use-thread-repo-items";
import { buildThreadGraphNodes } from "@/components/assistant-ui/thread-graph/build-graph-nodes";
import { buildThreadGraphExportText } from "@/components/assistant-ui/thread-graph/export-graph-json";
import {
  readFlowViewport,
  writeFlowViewport,
} from "@/components/assistant-ui/thread-graph/graph-storage";
import { buildGraphLegendItems } from "@/components/assistant-ui/thread-graph/graph-models";
import { getEdgeKey } from "@/components/assistant-ui/thread-graph/graph-geometry";
import { CanvasBlockLibrary } from "@/components/assistant-ui/thread-graph-flow/block-library";
import {
  buildCanvasFilterCounts,
  buildFocusPathNodeIds,
  buildGraphStructureSignature,
  buildRelatedContextIds,
  buildSelectedLineage,
  buildTreeStructureSignature,
  decorateCanvasEdges,
  decorateCanvasNodes,
  filterCanvasGraph,
  resolveCanvasVisibleNodeIds,
} from "@/components/assistant-ui/thread-graph-flow/canvas-graph-projection";
import { CanvasArtifactInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-artifact-inspector";
import { CanvasMessageInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-message-inspector";
import { CanvasSidebar } from "@/components/assistant-ui/thread-graph-flow/canvas-sidebar";
import { CanvasStage } from "@/components/assistant-ui/thread-graph-flow/canvas-stage";
import { buildCanvasFlowElements } from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import { estimateDataUrlBytes } from "@/components/assistant-ui/thread-graph-flow/canvas-upload-utils";
import {
  artifactAccent,
  artifactTypeLabel,
  CANVAS_BRANCH_CANCEL_FAILURE,
  CANVAS_BRANCH_RUN_NOTICE,
  CANVAS_PROMPT_DRAFT_NODE_ID,
  formatByteSize,
  isFlowViewport,
  readFlowRenderMode,
  scrollMessageIntoView,
  trimArtifactPreview,
  type FlowDensityMode,
  type FlowRenderMode,
  type FlowSpotlightMode,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import {
  getArtifactLineCount,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import { useCanvasRunManager } from "@/components/assistant-ui/thread-graph-flow/use-canvas-run-manager";
import { useCanvasBlockActions } from "@/components/assistant-ui/thread-graph-flow/use-canvas-block-actions";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
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
  getAllowedBranchOperations,
  getBranchOperationDetail,
} from "@/lib/thread-branching";
import { executeBranchSpec } from "@/lib/thread-branching-runtime";
import { ensureThreadIdle } from "@/lib/thread-run-control";
import { getContextBudgetPolicy } from "@/lib/context-budget";
import { toLlmContextArtifacts } from "@/lib/session-artifacts";

export function ThreadGraphFlow() {
  const runtime = useAssistantRuntime();
  const { historyMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { clearRequestError, requestError, setRequestError } = useRequestError();
  const { activeSessionId } = usePersistedSessions();
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
  } = useThreadRepoItems(runtime, { defaultModel: { modelId, provider } });
  const { cutLink, getParentId, overrides, resetLinks, restoreLink } = useLinkEditor();
  const {
    beginDraft,
    cancelDraft,
    draft,
    setDraftPosition,
    setDraftText,
    toggleDraftArtifact,
  } = useGraphBranchIntent();
  const [linkEditMode, setLinkEditMode] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState<FlowSpotlightMode>("all");
  const [densityMode, setDensityMode] = React.useState<FlowDensityMode>("overview");
  const [toolbarMenu, setToolbarMenu] = React.useState<"add" | "tools" | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);
  const [canvasDraftError, setCanvasDraftError] = React.useState<string | null>(null);
  const flowRenderModeKey = React.useMemo(
    () => `nodes.canvas.render-mode.v1:${activeSessionId ?? "unknown"}`,
    [activeSessionId],
  );
  const [flowRenderMode, setFlowRenderMode] = React.useState<FlowRenderMode>("2d");
  const [blockLibraryCollapsed, setBlockLibraryCollapsed] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<
    ReactFlowInstance<ThreadGraphFlowNode, ThreadGraphFlowEdge> | null
  >(null);
  const contextBudgetPolicy = React.useMemo(
    () => getContextBudgetPolicy({ modelId, provider }),
    [modelId, provider],
  );
  const imageUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const inspectorScrollRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarMenuRef = React.useRef<HTMLDivElement | null>(null);
  const flowViewportRef = React.useRef<HTMLDivElement | null>(null);
  const pendingDraftSubmissionRef = React.useRef(false);
  const pendingOutputRunRef = React.useRef<{
    beforeNodeIds: Set<string>;
    sourcePromptId: string;
    artifactIds: string[];
  } | null>(null);
  const canvasConversationNodesRef = React.useRef<ThreadGraphNodeModel[]>([]);
  const requestErrorRef = React.useRef<string | null>(requestError);

  React.useEffect(() => {
    requestErrorRef.current = requestError;
  }, [requestError]);

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
  const [storedViewport, setStoredViewport] = React.useState<Viewport | null>(() =>
    readFlowViewport(activeSessionId),
  );
  const treeSignatureRef = React.useRef<string | null>(null);

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
  React.useEffect(() => {
    canvasConversationNodesRef.current = canvasConversationNodes;
  }, [canvasConversationNodes]);
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
  });
  const linkedTargetCountByArtifact = React.useMemo(() => {
    const counts = new Map<string, number>();
    canvasLinks.forEach((link) => {
      counts.set(link.artifactId, (counts.get(link.artifactId) ?? 0) + 1);
    });
    return counts;
  }, [canvasLinks]);

  const legendItems = React.useMemo(() => {
    const conversationLegend = buildGraphLegendItems(nodes);
    const hasTextArtifacts = artifacts.some((artifact) => artifact.artifactType === "text");
    const hasCodeArtifacts = artifacts.some((artifact) => artifact.artifactType === "code");
    const hasImageArtifacts = artifacts.some((artifact) => artifact.artifactType === "image");
    const hasFileArtifacts = artifacts.some((artifact) => artifact.artifactType === "file");
    const hasCanvasPrompts = canvasPrompts.length > 0;
    return [
      ...conversationLegend,
      ...(hasTextArtifacts
        ? [{ key: "artifact-text", label: "Text Context", swatch: artifactAccent("text") }]
        : []),
      ...(hasCodeArtifacts
        ? [{ key: "artifact-code", label: "Code Context", swatch: artifactAccent("code") }]
        : []),
      ...(hasImageArtifacts
        ? [{ key: "artifact-image", label: "Image Context", swatch: artifactAccent("image") }]
        : []),
      ...(hasFileArtifacts
        ? [{ key: "artifact-file", label: "File Context", swatch: artifactAccent("file") }]
        : []),
      ...(hasCanvasPrompts
        ? [{ key: "canvas-prompt", label: "Independent Prompt", swatch: artifactAccent("prompt") }]
        : []),
    ];
  }, [artifacts, canvasPrompts.length, nodes]);

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
  }, [toolbarMenu]);

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
  const selectedContextLinkedMessageIds = React.useMemo(() => {
    if (!selectedArtifact) return new Set<string>();
    return new Set(
      contextLinks
        .filter((link) => link.artifactId === selectedArtifact.id)
        .map((link) => link.targetMessageId),
    );
  }, [contextLinks, selectedArtifact]);

  const filterCounts = React.useMemo(
  () => buildCanvasFilterCounts(canvasConversationNodes, artifacts.length),
  [artifacts.length, canvasConversationNodes],
);

  const selectedLineage = React.useMemo(
  () =>
    buildSelectedLineage({
      canvasConversationNodes,
      nodeIndex,
      selectedArtifactId: selectedArtifact?.id ?? null,
      selectedNodeId,
    }),
  [canvasConversationNodes, nodeIndex, selectedArtifact, selectedNodeId],
);

  const focusPathNodeIds = React.useMemo(
  () =>
    buildFocusPathNodeIds({
      canvasConversationNodes,
      nodeIndex,
      selectedArtifactId: selectedArtifact?.id ?? null,
      selectedContextArtifactIds,
      selectedContextLinkedMessageIds,
      selectedNodeId,
    }),
  [
    canvasConversationNodes,
    nodeIndex,
    selectedArtifact,
    selectedContextArtifactIds,
    selectedContextLinkedMessageIds,
    selectedNodeId,
  ],
);

  const handleCancelRun = React.useCallback(() => {
    clearRequestError();
    setCanvasDraftError(null);
    pendingDraftSubmissionRef.current = false;
    setIsSubmittingBranch(false);
    try {
      runtime.threads.main.cancelRun();
    } catch {
      const message = "Unable to cancel the current run.";
      setCanvasDraftError(message);
      setRequestError(message);
    }
  }, [clearRequestError, runtime.threads.main, setRequestError]);

  const handleCancelPromptDraft = React.useCallback(() => {
    pendingDraftSubmissionRef.current = false;
    setIsSubmittingBranch(false);
    setCanvasDraftError(null);
    clearRequestError();
    cancelDraft();
  }, [cancelDraft, clearRequestError]);

  const handleSubmitBranchDraft = React.useCallback(() => {
    if (!draftBranchSpec || !draft || !llmEnabled) return;
    const activeDraft = draft;

    void (async () => {
      let submitted = false;
      try {
        setIsSubmittingBranch(true);
        setCanvasDraftError(null);
        clearRequestError();

        const threadReady = await ensureThreadIdle(runtime.threads.main);
        if (!threadReady) {
          pendingDraftSubmissionRef.current = false;
          setCanvasDraftError(CANVAS_BRANCH_CANCEL_FAILURE);
          setRequestError(CANVAS_BRANCH_CANCEL_FAILURE);
          return;
        }

        pendingDraftSubmissionRef.current = true;
        pendingOutputRunRef.current = {
          beforeNodeIds: new Set(canvasConversationNodesRef.current.map((node) => node.id)),
          sourcePromptId: CANVAS_PROMPT_DRAFT_NODE_ID,
          artifactIds: [...activeDraft.outputArtifactIds],
        };
        const executed = executeBranchSpec(runtime.threads.main, draftBranchSpec, {
          contextArtifacts:
            draftContextArtifacts.length > 0
              ? toLlmContextArtifacts(draftContextArtifacts)
              : undefined,
          contextNodeIds:
            draftContextArtifacts.length > 0
              ? draftContextArtifacts.map((artifact) => artifact.id)
              : undefined,
          historyMode,
          inputArtifactIds: activeDraft.inputArtifactIds,
          modelId,
          outputArtifactIds: activeDraft.outputArtifactIds,
          outputArtifactTypes: activeDraft.outputArtifactIds.map(
            (artifactId) => artifactIndex.get(artifactId)?.semanticType ?? null,
          ),
          provider,
          text: activeDraft.text,
        });
        if (!executed) {
          pendingDraftSubmissionRef.current = false;
          pendingOutputRunRef.current = null;
          const message = "Branch draft is empty. Add a prompt before creating the branch.";
          setCanvasDraftError(message);
          setRequestError(message);
          return;
        }
        submitted = true;
      } catch {
        pendingDraftSubmissionRef.current = false;
        pendingOutputRunRef.current = null;
        const message = "Canvas branching failed. Try again from the selected node.";
        setCanvasDraftError(message);
        setRequestError(message);
      } finally {
        if (!submitted) {
          setIsSubmittingBranch(false);
        }
      }
    })();
  }, [
    artifactIndex,
    clearRequestError,
    draft,
    draftBranchSpec,
    draftContextArtifacts,
    historyMode,
    llmEnabled,
    modelId,
    provider,
    runtime.threads.main,
    setRequestError,
  ]);

  React.useEffect(() => {
    if (!requestError || !draft) return;
    setCanvasDraftError(requestError);
    if (pendingDraftSubmissionRef.current) {
      pendingDraftSubmissionRef.current = false;
      setIsSubmittingBranch(false);
    }
  }, [draft, requestError]);

  React.useEffect(() => {
    const unsubscribe = runtime.threads.main.unstable_on("runEnd", () => {
      const pendingOutput = pendingOutputRunRef.current;
      const resolveCompletedRun = (attempt: number) => {
        const currentNodes = canvasConversationNodesRef.current;
        const newNodes = pendingOutput
          ? currentNodes.filter((node) => !pendingOutput.beforeNodeIds.has(node.id))
          : [];
        const responseNode = [...newNodes]
          .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))
          .find((node) => node.role === "assistant");
        const promptNode =
          responseNode?.parentId
            ? currentNodes.find((node) => node.id === responseNode.parentId) ?? null
            : [...newNodes]
                .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))
                .find((node) => node.role === "user") ?? null;

        if (pendingOutput && responseNode && promptNode) {
          applyCompletedResponse({
            promptId: promptNode.id,
            responseId: responseNode.id,
            sourcePromptId: pendingOutput.sourcePromptId,
            artifactIds: pendingOutput.artifactIds,
            text: responseNode.text,
          });
          pendingOutputRunRef.current = null;
        } else if (pendingOutput && attempt < 12) {
          window.setTimeout(() => resolveCompletedRun(attempt + 1), 75);
          return;
        } else {
          pendingOutputRunRef.current = null;
        }

        if (!pendingDraftSubmissionRef.current) return;
        if (requestErrorRef.current) {
          pendingDraftSubmissionRef.current = false;
          setIsSubmittingBranch(false);
          return;
        }
        pendingDraftSubmissionRef.current = false;
        setCanvasDraftError(null);
        cancelDraft();
        setIsSubmittingBranch(false);
      };
      window.setTimeout(() => resolveCompletedRun(0), 0);
    });
    return unsubscribe;
  }, [applyCompletedResponse, cancelDraft, runtime.threads.main]);

  const applyCanvasSelection = React.useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      setCanvasSelectionId(nodeId);
      if (!nodeId || nodeId === ROOT_NODE_ID || nodeId === CANVAS_PROMPT_DRAFT_NODE_ID) {
        setFocusedMessageId(null);
        return;
      }
      if (artifactIndex.has(nodeId) || promptIndex.has(nodeId)) {
        setFocusedMessageId(null);
        return;
      }
      if (nodeIndex.has(nodeId)) {
        setFocusedMessageId(nodeId);
      }
    },
    [artifactIndex, nodeIndex, promptIndex, setCanvasSelectionId, setFocusedMessageId],
  );

  React.useEffect(() => {
    if (!focusedMessageId || focusedMessageId === selectedNodeId) {
      return;
    }
    if (!nodeIndex.has(focusedMessageId)) {
      return;
    }
    setSelectedNodeId(focusedMessageId);
  }, [focusedMessageId, nodeIndex, selectedNodeId]);

  React.useEffect(() => {
    if (!canvasSelectionId || canvasSelectionId === selectedNodeId) {
      return;
    }
    if (
      !nodeIndex.has(canvasSelectionId) &&
      !artifactIndex.has(canvasSelectionId) &&
      !promptIndex.has(canvasSelectionId)
    ) {
      return;
    }
    applyCanvasSelection(canvasSelectionId);
  }, [applyCanvasSelection, artifactIndex, canvasSelectionId, nodeIndex, promptIndex, selectedNodeId]);

  React.useEffect(() => {
    if (densityMode === "focus" && !selectedNodeId) {
      setDensityMode("overview");
    }
  }, [densityMode, selectedNodeId]);

  React.useEffect(() => {
    const inspector = inspectorScrollRef.current;
    if (!inspector) return;
    inspector.scrollTop = 0;
  }, [
    draft?.anchorId,
    draft?.operation,
    linkEditMode,
    selectedNodeId,
    selectedArtifact?.id,
    selectedMessageNode?.id,
  ]);

  const relatedContextIds = React.useMemo(
  () =>
    buildRelatedContextIds(
      selectedContextArtifactIds,
      selectedContextLinkedMessageIds,
    ),
  [selectedContextArtifactIds, selectedContextLinkedMessageIds],
);

  const handleCutEdge = React.useCallback(
    (childId: string, parentId: string | null) => {
      cutLink(childId, parentId);
      applyCanvasSelection(childId);
    },
    [applyCanvasSelection, cutLink],
  );

  const {
    conversationEdges: baseConversationEdges,
    edges: flowEdges,
    nodes: flowNodes,
  } = React.useMemo(
    () =>
      buildCanvasFlowElements({
        artifacts,
        artifactIndex,
        canvasConversationNodes,
        canvasLinks,
        canvasPrompts,
        cancelCanvasPrompt,
        canvasDraftError,
        contextLinks,
        deleteArtifact,
        draft,
        draftAnchorNode,
        draftBranchSpec,
        draftContextCount: draftContextArtifacts.length,
        draftDetail,
        getArtifactsForTarget,
        handleCancelPromptDraft,
        handleCancelRun,
        handleCutEdge,
        handleSubmitBranchDraft,
        isSubmittingBranch,
        isThreadRunning,
        linkedTargetCountByArtifact,
        linkEditMode,
        llmEnabled,
        nodeIndex,
        overrides,
        promptIndex,
        requestError,
        runCanvasPrompt,
        setDraftText,
        updateArtifact,
      }),
    [
      artifacts,
      artifactIndex,
      canvasConversationNodes,
      canvasLinks,
      canvasPrompts,
      cancelCanvasPrompt,
      canvasDraftError,
      contextLinks,
      deleteArtifact,
      draft,
      draftAnchorNode,
      draftBranchSpec,
      draftContextArtifacts.length,
      draftDetail,
      getArtifactsForTarget,
      handleCancelPromptDraft,
      handleCancelRun,
      handleCutEdge,
      handleSubmitBranchDraft,
      isSubmittingBranch,
      isThreadRunning,
      linkedTargetCountByArtifact,
      linkEditMode,
      llmEnabled,
      nodeIndex,
      overrides,
      promptIndex,
      requestError,
      runCanvasPrompt,
      setDraftText,
      updateArtifact,
    ],
  );

  const visibleNodeIds = React.useMemo(
  () =>
    resolveCanvasVisibleNodeIds({
      densityMode,
      focusPathNodeIds,
      selectedNodeId,
    }),
  [densityMode, focusPathNodeIds, selectedNodeId],
);

const { nodes: visibleFlowNodes, edges: visibleFlowEdges } = React.useMemo(
  () => filterCanvasGraph(flowNodes, flowEdges, visibleNodeIds),
  [flowEdges, flowNodes, visibleNodeIds],
);

  const decoratedFlowNodes = React.useMemo<ThreadGraphFlowNode[]>(
  () =>
    decorateCanvasNodes({
      nodeIndex,
      relatedContextIds,
      selectedLineage,
      selectedNodeId,
      spotlight,
      visibleFlowNodes,
    }),
  [
    nodeIndex,
    relatedContextIds,
    selectedLineage,
    selectedNodeId,
    spotlight,
    visibleFlowNodes,
  ],
);

  const decoratedFlowEdges = React.useMemo<ThreadGraphFlowEdge[]>(
  () =>
    decorateCanvasEdges({
      decoratedFlowNodes,
      relatedContextIds,
      selectedLineage,
      selectedNodeId,
      spotlight,
      visibleFlowEdges,
    }),
  [
    decoratedFlowNodes,
    relatedContextIds,
    selectedLineage,
    selectedNodeId,
    spotlight,
    visibleFlowEdges,
  ],
);

  const graphStructureSignature = React.useMemo(
  () => buildGraphStructureSignature(decoratedFlowNodes, decoratedFlowEdges),
  [decoratedFlowEdges, decoratedFlowNodes],
);

  const treeStructureSignature = React.useMemo(
  () =>
    buildTreeStructureSignature(
      canvasConversationNodes,
      baseConversationEdges,
    ),
  [baseConversationEdges, canvasConversationNodes],
);

  React.useEffect(() => {
    if (!reactFlowInstance || decoratedFlowNodes.length === 0) return;

    const previousSignature = treeSignatureRef.current;
    treeSignatureRef.current = treeStructureSignature;

    if (previousSignature === null || previousSignature === treeStructureSignature) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      void reactFlowInstance
        .fitView({
          duration: 420,
          padding: 0.22,
        })
        .then(() => {
          setStoredViewport(reactFlowInstance.getViewport());
        });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [decoratedFlowNodes.length, reactFlowInstance, treeStructureSignature]);

  React.useEffect(() => {
    if (!reactFlowInstance || !focusedMessageId || !nodeIndex.has(focusedMessageId)) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      void reactFlowInstance
        .fitView({
          duration: 260,
          padding: 0.34,
          nodes: [{ id: focusedMessageId }],
        })
        .then(() => {
          setStoredViewport(reactFlowInstance.getViewport());
        });
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [focusedMessageId, nodeIndex, reactFlowInstance]);

  React.useEffect(() => {
    if (!reactFlowInstance || densityMode !== "focus" || !selectedNodeId) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      void reactFlowInstance
        .fitView({
          duration: 280,
          padding: 0.28,
        })
        .then(() => {
          setStoredViewport(reactFlowInstance.getViewport());
        });
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [densityMode, reactFlowInstance, selectedNodeId, visibleFlowNodes.length]);

  React.useEffect(() => {
    if (!reactFlowInstance || !draft || flowRenderMode !== "2d") {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      void reactFlowInstance
        .fitView({
          duration: 320,
          padding: 0.34,
          nodes: [{ id: CANVAS_PROMPT_DRAFT_NODE_ID }],
        })
        .then(() => {
          setStoredViewport(reactFlowInstance.getViewport());
        });
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [draft, flowRenderMode, reactFlowInstance]);

  const selectedFlowNode = React.useMemo(
    () => decoratedFlowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [decoratedFlowNodes, selectedNodeId],
  );
  const selectedBranchOptions = React.useMemo(() => {
    if (!selectedMessageNode) return [];
    return getAllowedBranchOperations(selectedMessageNode).map(getBranchOperationDetail);
  }, [selectedMessageNode]);

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

  const handleFocusSelected = React.useCallback(async () => {
    if (!reactFlowInstance || !selectedNodeId) return;
    await reactFlowInstance.fitView({
      duration: 500,
      padding: 0.4,
      nodes: [{ id: selectedNodeId }],
    });
    setStoredViewport(reactFlowInstance.getViewport());
  }, [reactFlowInstance, selectedNodeId]);

  const handleOpenSelectedInChat = React.useCallback(() => {
    if (!selectedMessageNode || selectedMessageNode.id === ROOT_NODE_ID) return;
    setViewMode("split");
    setFocusedMessageId(selectedMessageNode.id);
    scrollMessageIntoView(selectedMessageNode.id);
  }, [selectedMessageNode, setFocusedMessageId, setViewMode]);

  const handleResetView = React.useCallback(async () => {
    if (!reactFlowInstance) return;
    await reactFlowInstance.fitView({ duration: 450, padding: 0.18 });
    setStoredViewport(reactFlowInstance.getViewport());
  }, [reactFlowInstance]);

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
    [beginDraft, clearRequestError, selectedMessageNode, setFlowRenderMode],
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

  const selectedBranchTrail = React.useMemo(() => {
    if (!selectedMessageNode) return [];

    const formatTrailLabel = (node: ThreadGraphNodeModel) => {
      if (node.id === ROOT_NODE_ID) return "root";
      const preview = node.text.replace(/\s+/g, " ").trim();
      if (!preview) {
        return node.role === "assistant" ? "assistant reply" : "user prompt";
      }
      return preview.length > 28 ? `${preview.slice(0, 25)}...` : preview;
    };

    const trail: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = selectedMessageNode.id;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = nodeIndex.get(currentId);
      if (!node) break;
      trail.unshift(formatTrailLabel(node));
      currentId = node.parentId;
    }

    return trail;
  }, [nodeIndex, selectedMessageNode]);

  const selectedBranchPathLabel = React.useMemo(
    () => selectedBranchTrail.join(" > "),
    [selectedBranchTrail],
  );

  const selectedPreview = selectedFlowNode?.data.preview?.replace(/\s+/g, " ").trim() ?? "";
  const visibleCanvasNodeCount = decoratedFlowNodes.length;
  const hiddenCanvasNodeCount = Math.max(0, flowNodes.length - visibleCanvasNodeCount);
  const selectedArtifactSize = formatByteSize(selectedArtifact?.byteSize);
  const selectedArtifactPreviewSize = selectedArtifact?.sourceDataUrl
    ? formatByteSize(estimateDataUrlBytes(selectedArtifact.sourceDataUrl))
    : null;
  const selectedArtifactStatChips = React.useMemo(
    () => (selectedArtifact ? getArtifactStatChips(selectedArtifact) : []),
    [selectedArtifact],
  );
  const selectedArtifactLineCount = React.useMemo(
    () => (selectedArtifact ? getArtifactLineCount(selectedArtifact) : 0),
    [selectedArtifact],
  );
  const selectedCanvasLabel = React.useMemo(() => {
    if (selectedArtifact) {
      return `${artifactTypeLabel(selectedArtifact)} selected`;
    }
    if (selectedMessageNode) {
      return `${selectedMessageNode.role} branch selected`;
    }
    return "No active focus";
  }, [selectedArtifact, selectedMessageNode]);
  const selectedCanvasPreview = React.useMemo(() => {
    if (selectedArtifact) {
      return trimArtifactPreview(selectedArtifact);
    }
    if (selectedPreview.length > 0) {
      return selectedPreview;
    }
    return "Use the canvas to branch, compare, and pin reusable context.";
  }, [selectedArtifact, selectedPreview]);
  const showCanvasPromptCta =
    !draft &&
    !selectedArtifact &&
    (!selectedMessageNode || selectedMessageNode.id === ROOT_NODE_ID);
  const attachableTargets = React.useMemo(
    () =>
      canvasConversationNodes.filter((node) => !node.isBridge).map((node) => ({
        id: node.id,
        preview: node.text.replace(/\s+/g, " ").trim() || (node.id === ROOT_NODE_ID ? "Conversation root" : "No preview"),
        role: node.id === ROOT_NODE_ID ? "root" : node.role,
      })),
    [canvasConversationNodes],
  );

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.08),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.9))]">
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        data-testid="artifact-image-upload-input"
        className="hidden"
        onChange={handleImageUploadChange}
      />
      <input
        ref={fileUploadInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUploadChange}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CanvasBlockLibrary
          collapsed={blockLibraryCollapsed}
          onAddBlock={(block) => handleAddCanvasBlock(block)}
          onCollapsedChange={setBlockLibraryCollapsed}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <CanvasSidebar
activeCanvasRunCount={activeCanvasRunCount}
artifactCount={artifacts.length}
connectionError={connectionError}
densityMode={densityMode}
filterCounts={filterCounts}
flowNodeCount={flowNodes.length}
flowRenderMode={flowRenderMode}
hiddenCanvasNodeCount={hiddenCanvasNodeCount}
legendItems={legendItems}
linkEditMode={linkEditMode}
onCancelAllRuns={cancelAllCanvasRuns}
onCopyJson={handleCopyJson}
onCreatePrompt={() => handleCreatePromptNode()}
onDensityModeChange={setDensityMode}
onFlowRenderModeChange={setFlowRenderMode}
onLinkEditModeChange={setLinkEditMode}
onResetLinks={resetLinks}
onSpotlightChange={setSpotlight}
onToolbarMenuChange={setToolbarMenu}
promptDisabled={!llmEnabled}
queuedCanvasRunCount={queuedCanvasRunCount}
resetLinkCount={overrides.size}
selectedBranchPathLabel={selectedBranchPathLabel}
selectedCanvasLabel={selectedCanvasLabel}
selectedCanvasPreview={selectedCanvasPreview}
selectedNodeId={selectedNodeId}
showCanvasPromptCta={showCanvasPromptCta}
showInspector={
  !!selectedArtifact ||
  (!!selectedFlowNode && !!selectedMessageNode) ||
  linkEditMode ||
  overrides.size > 0
}
spotlight={spotlight}
toolbarMenu={toolbarMenu}
toolbarMenuRef={toolbarMenuRef}
visibleCanvasNodeCount={visibleCanvasNodeCount}
        >
<div
  ref={inspectorScrollRef}
  className="max-h-[min(34rem,calc(100vh-11rem))] overflow-y-auto rounded-[26px] border border-border/60 bg-background/85 px-3 py-3 shadow-sm"
>
  {selectedArtifact ? (
    <CanvasArtifactInspector
      artifact={selectedArtifact}
      artifactLineCount={selectedArtifactLineCount}
      artifactPreviewSize={selectedArtifactPreviewSize}
      artifactSize={selectedArtifactSize}
      artifactStatChips={selectedArtifactStatChips}
      attachableTargets={attachableTargets}
      contextBudgetMaxImagePreviewBytes={
        contextBudgetPolicy.maxImagePreviewBytes
      }
      hasOutputLink={canvasLinks.some(
        (link) =>
          link.relation === "output" &&
          link.artifactId === selectedArtifact.id,
      )}
      isLinkedToTarget={(targetId) =>
        isArtifactLinkedToTarget(selectedArtifact.id, targetId)
      }
      linkedTargetCount={selectedContextLinkedMessageIds.size}
      onConnectTo={handleArtifactConnectFromInspector}
      onDelete={() => {
        deleteArtifact(selectedArtifact.id);
        applyCanvasSelection(null);
      }}
      onDisconnectOutput={() => {
        const outputLink = canvasLinks.find(
          (link) =>
            link.relation === "output" &&
            link.artifactId === selectedArtifact.id,
        );
        if (outputLink) removeCanvasLink(outputLink.id);
      }}
      onOpenTarget={applyCanvasSelection}
      onRestoreRevision={(revisionId) =>
        restoreArtifactRevision(selectedArtifact.id, revisionId)
      }
      onToggleLink={(targetId) =>
        handleToggleArtifactLink(selectedArtifact.id, targetId)
      }
      onToggleSync={() =>
        setArtifactSyncMode(
          selectedArtifact.id,
          selectedArtifact.syncMode === "paused" ? "auto" : "paused",
        )
      }
      onUpdate={(patch) => updateArtifact(selectedArtifact.id, patch)}
    />
  ) : selectedFlowNode && selectedMessageNode ? (
    <CanvasMessageInspector
      activeDraft={
        draft && draft.anchorId === selectedMessageNode.id
          ? { operation: draft.operation, text: draft.text }
          : null
      }
      artifacts={artifacts}
      busy={isSubmittingBranch}
      contextCount={selectedContextArtifacts.length}
      details={selectedBranchOptions}
      disabled={!llmEnabled}
      isLinkedToTarget={(artifactId) =>
        isArtifactLinkedToTarget(artifactId, selectedMessageNode.id)
      }
      linkEditMode={linkEditMode}
      onCancelDraft={handleCancelPromptDraft}
      onCancelRun={isThreadRunning ? handleCancelRun : undefined}
      onChooseOperation={handleChooseBranchOperation}
      onClearFocus={() => applyCanvasSelection(null)}
      onCutSelected={handleCutSelected}
      onDraftTextChange={setDraftText}
      onFocusSelected={handleFocusSelected}
      onOpenInChat={handleOpenSelectedInChat}
      onResetView={handleResetView}
      onRestoreSelected={handleRestoreSelected}
      onSubmitDraft={handleSubmitBranchDraft}
      onToggleArtifactLink={(artifactId) =>
        handleToggleArtifactLink(artifactId, selectedMessageNode.id)
      }
      runInterruptionNote={
        isThreadRunning ? CANVAS_BRANCH_RUN_NOTICE : null
      }
      selectedBranchPathLabel={selectedBranchPathLabel}
      selectedFlowNode={selectedFlowNode}
      selectedNodeId={selectedNodeId}
      selectedOverride={!!selectedOverride}
      selectedParentId={selectedParentId}
      selectedPreview={selectedPreview}
    />
  ) : (
    <div className="space-y-2 rounded-[24px] border border-dashed border-border/70 bg-background/80 px-4 py-5 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Nothing selected
      </p>
      <p className="text-sm font-medium text-foreground/85">
        Pick a message node to branch, or select an artifact to shape
        reusable context.
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        The canvas is your structured input layer. Use it to build
        artifacts the model can reason over without losing
        human-readable form.
      </p>
    </div>
  )}
</div>
        </CanvasSidebar>
        <CanvasStage
          activeSessionId={activeSessionId}
          edges={decoratedFlowEdges}
          flowRenderMode={flowRenderMode}
          graphStructureSignature={graphStructureSignature}
          nodes={decoratedFlowNodes}
          onArtifactPositionChange={(artifactId, position) =>
            updateArtifact(artifactId, { position })
          }
          onCanvasConnect={handleCanvasConnect}
          onCanvasDragOver={handleCanvasDragOver}
          onCanvasDrop={handleCanvasDrop}
          onDraftPositionChange={setDraftPosition}
          onInit={setReactFlowInstance}
          onMessageOpen={(messageId) => {
            applyCanvasSelection(messageId);
            setViewMode("split");
            scrollMessageIntoView(messageId);
          }}
          onNodeSelect={applyCanvasSelection}
          onViewportChange={setStoredViewport}
          selectedNodeId={selectedNodeId}
          storedViewport={storedViewport}
          viewportRef={flowViewportRef}
        />
      </div>
      </div>
    </section>
  );
}
