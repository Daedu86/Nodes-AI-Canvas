"use client";

import "@xyflow/react/dist/style.css";
import { useAssistantRuntime } from "@assistant-ui/react";
import {
  MarkerType,
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
import {
  buildGraphLegendItems,
  getGraphModelLabel,
  getGraphModelPalette,
} from "@/components/assistant-ui/thread-graph/graph-models";
import { getEdgeKey, nodesShareBranch } from "@/components/assistant-ui/thread-graph/graph-geometry";
import {
  CANVAS_BLOCK_DRAG_MIME,
  CanvasBlockLibrary,
  getCanvasBlockDefinition,
  type CanvasBlockDefinition,
} from "@/components/assistant-ui/thread-graph-flow/block-library";
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
import {
  buildImagePreviewDataUrl,
  estimateDataUrlBytes,
  getArtifactUploadLimit,
  getFileStem,
  isTextLikeFile,
  trimStoredArtifactContent,
} from "@/components/assistant-ui/thread-graph-flow/canvas-upload-utils";
import {
  artifactAccent,
  artifactDefaultTitle,
  artifactTypeLabel,
  CANVAS_BRANCH_CANCEL_FAILURE,
  CANVAS_BRANCH_RUN_NOTICE,
  CANVAS_PROMPT_DRAFT_NODE_ID,
  formatByteSize,
  isFlowViewport,
  providerDisplay,
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
import { layoutThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-layout";
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
import { formatBytes, getContextBudgetPolicy } from "@/lib/context-budget";
import {
  parseArtifactOutput,
  type SessionArtifact,
  type SessionArtifactSemanticType,
  type SessionCanvasEndpoint,
  toLlmContextArtifacts,
} from "@/lib/session-artifacts";

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
  const pendingUploadPlacementRef = React.useRef<{
    position: { x: number; y: number } | null;
    relation: "input" | "output" | null;
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

  const baseConversationNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    return canvasConversationNodes.map((node) => {
      const palette = getGraphModelPalette({
        defaultFill: "rgba(255,255,255,0.94)",
        defaultStroke: "rgba(15,23,42,0.08)",
        isDarkBg: false,
        model: node.model,
        provider: node.provider,
      });
      return {
        id: node.id,
        type: "threadNode",
        position: { x: 0, y: 0 },
        selectable: true,
        draggable: false,
        data: {
          accent: palette.swatch,
          branchId:
            typeof node.branchId === "string" || typeof node.branchId === "number"
              ? node.branchId
              : null,
          depth: node.depth,
          editedFromId: node.editedFromId ?? null,
          emphasis: "normal",
          filterMatched: true,
          isBridge: Boolean(node.isBridge),
          isCut: overrides.has(node.id),
          isRoot: node.id === ROOT_NODE_ID,
          kind: node.id === ROOT_NODE_ID ? "root" : node.isBridge ? "bridge" : "message",
          language: null,
          linkedArtifactCount: getArtifactsForTarget(node.id).length,
          model: node.model ?? null,
          modelLabel: getGraphModelLabel(node.model, node.provider),
          position: null,
          preview: node.text,
          provider: node.provider ?? null,
          providerLabel: providerDisplay(node.provider),
          role: node.role,
          idx: node.idx,
          title: null,
        },
      };
    });
  }, [canvasConversationNodes, getArtifactsForTarget, overrides]);

  const baseArtifactNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    return artifacts.map((artifact) => ({
      id: artifact.id,
      type: "artifactNode",
      position: artifact.position ?? { x: 0, y: 0 },
      selectable: true,
      draggable: true,
      data: {
        accent: artifactAccent(artifact),
        artifactType: artifact.artifactType,
        byteSize: artifact.byteSize ?? null,
        emphasis: "normal",
        fileName: artifact.fileName ?? null,
        filterMatched: true,
        kind: "artifact",
        language: artifact.language ?? null,
        linkedArtifactCount: linkedTargetCountByArtifact.get(artifact.id) ?? 0,
        mimeType: artifact.mimeType ?? null,
        position: artifact.position ?? null,
        preview: artifact.content,
        revisionCount: artifact.revisions?.length ?? 0,
        role: "artifact",
        semanticType: artifact.semanticType ?? null,
        sourceDataUrl: artifact.sourceDataUrl ?? null,
        syncMode: artifact.syncMode ?? "auto",
        title: artifact.title,
      },
    }));
  }, [artifacts, linkedTargetCountByArtifact]);

  const baseCanvasPromptNodes = React.useMemo<ThreadGraphFlowNode[]>(() =>
    canvasPrompts.map((prompt) => {
      const inputCount = canvasLinks.filter(
        (link) => link.relation === "context" && link.promptId === prompt.id,
      ).length;
      const outputCount = canvasLinks.filter(
        (link) => link.relation === "output" && link.promptId === prompt.id,
      ).length;
      const status = prompt.promptStatus ?? "idle";
      return {
        id: prompt.id,
        type: "promptNode",
        position: prompt.position ?? { x: 0, y: 0 },
        selectable: true,
        draggable: true,
        data: {
          accent: "#0f766e",
          draftBusy: status === "running" || status === "queued",
          draftContextCount: inputCount,
          draftDisabled: !llmEnabled,
          draftError: prompt.promptError ?? null,
          draftOutputCount: outputCount,
          draftText: prompt.content,
          emphasis: "normal",
          filterMatched: true,
          kind: "canvas-prompt",
          position: prompt.position ?? null,
          preview: prompt.content || "Independent canvas prompt",
          promptResult: prompt.promptResult ?? null,
          promptStatus: status,
          role: "prompt",
          title: prompt.title,
          onDraftCancel: () => deleteArtifact(prompt.id),
          onDraftCancelRun:
            status === "running" || status === "queued"
              ? () => cancelCanvasPrompt(prompt.id)
              : undefined,
          onDraftSubmit: () => runCanvasPrompt(prompt.id),
          onDraftTextChange: (value) =>
            updateArtifact(prompt.id, { content: value }, { revisionOrigin: "manual", revisionAuthor: "user" }),
        },
      } satisfies ThreadGraphFlowNode;
    }),
  [canvasLinks, canvasPrompts, cancelCanvasPrompt, deleteArtifact, llmEnabled, runCanvasPrompt, updateArtifact]);

  const handleCutEdge = React.useCallback(
    (childId: string, parentId: string | null) => {
      cutLink(childId, parentId);
      applyCanvasSelection(childId);
    },
    [applyCanvasSelection, cutLink],
  );

  const baseConversationEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return canvasConversationNodes
      .filter((node) => node.parentId !== null)
      .map((node) => {
        const parentNode = node.parentId ? nodeIndex.get(node.parentId) ?? null : null;
        const isEditable = parentNode ? parentNode.id !== ROOT_NODE_ID && nodesShareBranch(parentNode, node) : false;
        const palette = getGraphModelPalette({
          defaultFill: "rgba(255,255,255,0.94)",
          defaultStroke: "rgba(15,23,42,0.08)",
          isDarkBg: false,
          model: node.model,
          provider: node.provider,
        });
        return {
          id: getEdgeKey(node.parentId, node.id),
          source: node.parentId!,
          target: node.id,
          type: "threadEdge",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: palette.swatch,
            width: 18,
            height: 18,
          },
          selectable: false,
          data: {
            accent: palette.swatch,
            editable: isEditable,
            emphasis: "normal",
            isBridge: Boolean(node.isBridge),
            isEdited: Boolean(node.editedFromId),
            label: node.isBridge ? "bridge" : node.editedFromId ? "edited" : undefined,
            linkEditMode,
            onCut: isEditable ? () => handleCutEdge(node.id, node.parentId) : undefined,
            tone: node.isBridge ? "bridge" : node.editedFromId ? "edited" : "default",
          },
        };
      });
  }, [canvasConversationNodes, handleCutEdge, linkEditMode, nodeIndex]);

  const baseContextEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return contextLinks.flatMap((link) => {
      const artifact = artifactIndex.get(link.artifactId);
      const targetExists = nodeIndex.has(link.targetMessageId) || promptIndex.has(link.targetMessageId);
      if (!artifact || !targetExists) return [];
      const accent = artifactAccent(artifact);
      return [
        {
          id: `context:${link.artifactId}->${link.targetMessageId}`,
          source: link.artifactId,
          target: link.targetMessageId,
          type: "threadEdge",
          selectable: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: accent,
            width: 16,
            height: 16,
          },
          data: {
            accent,
            emphasis: "normal",
            label: "context",
            tone: "context",
          },
        },
      ];
    });
  }, [artifactIndex, contextLinks, nodeIndex, promptIndex]);

  const baseOutputEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return canvasLinks.flatMap((link) => {
      if (link.relation !== "output") return [];
      const artifact = artifactIndex.get(link.artifactId);
      const sourceId =
        link.promptId && promptIndex.has(link.promptId)
          ? link.promptId
          : link.responseId ?? link.promptId;
      if (!artifact || !sourceId) return [];
      const sourceExists =
        sourceId === CANVAS_PROMPT_DRAFT_NODE_ID ||
        nodeIndex.has(sourceId) ||
        promptIndex.has(sourceId);
      if (!sourceExists) return [];
      const pending = !link.responseId;
      const accent = artifactAccent(artifact);
      return [{
        id: `output:${sourceId}->${link.artifactId}`,
        source: sourceId,
        target: link.artifactId,
        type: "threadEdge",
        selectable: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: accent,
          width: 16,
          height: 16,
        },
        data: {
          accent,
          emphasis: "normal",
          label: pending ? "pending output" : "output",
          tone: pending ? "pending-output" : "output",
        },
      }];
    });
  }, [artifactIndex, canvasLinks, nodeIndex, promptIndex]);

  const baseDraftNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    if (!draft || !draftBranchSpec || !draftDetail) return [];
    const sourceNode = nodeIndex.get(draftBranchSpec.parentId ?? ROOT_NODE_ID) ?? draftAnchorNode;
    return [
      {
        id: CANVAS_PROMPT_DRAFT_NODE_ID,
        type: "promptNode",
        position: { x: 0, y: 0 },
        selectable: true,
        draggable: false,
        data: {
          accent: "#0f766e",
          depth: (sourceNode?.depth ?? 0) + 1,
          draftBusy: isSubmittingBranch,
          draftContextCount: draftContextArtifacts.length,
          draftOutputCount: draft.outputArtifactIds.length,
          draftDetail,
          draftDisabled: !llmEnabled,
          draftError: canvasDraftError ?? requestError,
          draftOperation: draft.operation,
          draftRunInterruptionNote: isThreadRunning ? CANVAS_BRANCH_RUN_NOTICE : null,
          draftText: draft.text,
          emphasis: "normal",
          filterMatched: true,
          kind: "prompt-draft",
          position: draft.position ?? null,
          preview: draft.text || "Draft prompt",
          role: "draft",
          title: "Draft prompt",
          onDraftCancel: handleCancelPromptDraft,
          onDraftCancelRun: isThreadRunning ? handleCancelRun : undefined,
          onDraftSubmit: handleSubmitBranchDraft,
          onDraftTextChange: setDraftText,
        },
      },
    ];
  }, [
    draft,
    draftAnchorNode,
    draftBranchSpec,
    canvasDraftError,
    draftContextArtifacts.length,
    draftDetail,
    handleCancelPromptDraft,
    handleCancelRun,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    isThreadRunning,
    llmEnabled,
    nodeIndex,
    requestError,
    setDraftText,
  ]);

  const baseDraftEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    if (!draftBranchSpec) return [];
    const sourceId = draftBranchSpec.parentId ?? ROOT_NODE_ID;
    if (!nodeIndex.has(sourceId)) return [];
    return [
      {
        id: `draft:${sourceId}->${CANVAS_PROMPT_DRAFT_NODE_ID}`,
        source: sourceId,
        target: CANVAS_PROMPT_DRAFT_NODE_ID,
        type: "threadEdge",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#0f766e",
          width: 18,
          height: 18,
        },
        selectable: false,
        data: {
          accent: "#0f766e",
          emphasis: "normal",
          label: "draft",
          tone: "draft",
        },
      },
    ];
  }, [draftBranchSpec, nodeIndex]);

  const { nodes: flowNodes, edges: flowEdges } = React.useMemo(
    () =>
      layoutThreadGraphFlow(
        [...baseConversationNodes, ...baseDraftNodes, ...baseCanvasPromptNodes, ...baseArtifactNodes],
        [...baseConversationEdges, ...baseDraftEdges, ...baseContextEdges, ...baseOutputEdges],
      ),
    [
      baseArtifactNodes,
      baseCanvasPromptNodes,
      baseContextEdges,
      baseConversationEdges,
      baseOutputEdges,
      baseConversationNodes,
      baseDraftEdges,
      baseDraftNodes,
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

  const handleCreatePromptNode = React.useCallback((position?: { x: number; y: number } | null) => {
    clearRequestError();
    setCanvasDraftError(null);
    const prompt = createArtifact({
      artifactType: "prompt",
      content: "",
      position: position ?? null,
      semanticType: null,
      title: `Prompt ${canvasPrompts.length + 1}`,
    });
    setFlowRenderMode("2d");
    setSelectedNodeId(prompt.id);
    setCanvasSelectionId(prompt.id);
    setFocusedMessageId(null);
  }, [
    canvasPrompts.length,
    clearRequestError,
    createArtifact,
    setCanvasSelectionId,
    setFocusedMessageId,
  ]);

  const handleCreateArtifact = React.useCallback(
    (
      artifactType: SessionArtifact["artifactType"],
      options?: {
        semanticType?: SessionArtifactSemanticType | null;
        position?: { x: number; y: number } | null;
      },
    ) => {
      const created = createArtifact({
        artifactType,
        semanticType: options?.semanticType ?? null,
        title: artifactDefaultTitle(artifactType, artifacts, options?.semanticType ?? null),
        content: "",
        language: artifactType === "code" ? "ts" : null,
        position: options?.position ?? null,
      });
      setSelectedNodeId(created.id);
      setCanvasSelectionId(created.id);
      setFocusedMessageId(null);
      return created;
    },
    [artifacts, createArtifact, setCanvasSelectionId, setFocusedMessageId],
  );

  const handleCreateArtifactFromFile = React.useCallback(
    async (artifactType: "image" | "file", file: File) => {
      try {
        clearRequestError();
        if (!activeSessionId) {
          throw new Error("No active session available for artifact upload");
        }
        const maxUploadBytes = getArtifactUploadLimit(artifactType, contextBudgetPolicy);
        if (file.size > maxUploadBytes) {
          setRequestError(
            `Selected ${artifactType} is ${formatBytes(file.size)}. The app limit is ${formatBytes(maxUploadBytes)} to keep session context stable.`,
          );
          return;
        }

        const uploadFormData = new FormData();
        uploadFormData.append("file", file);
        const uploadResponse = await fetch(`/api/sessions/${activeSessionId}/artifacts`, {
          method: "POST",
          body: uploadFormData,
        });
        if (!uploadResponse.ok) {
          const reason = await uploadResponse.text();
          throw new Error(reason || `Artifact upload failed: ${uploadResponse.status}`);
        }
        const uploadData = (await uploadResponse.json()) as {
          blobRef?: string;
          byteSize?: number;
          fileName?: string;
          mimeType?: string | null;
        };

        const content =
          artifactType === "file" && isTextLikeFile(file)
            ? trimStoredArtifactContent(await file.text(), contextBudgetPolicy.maxCharsPerArtifact)
            : "";
        const sourceDataUrl =
          artifactType === "image"
            ? await buildImagePreviewDataUrl(
                file,
                contextBudgetPolicy.maxImagePreviewBytes,
                contextBudgetPolicy.maxImagePreviewDimension,
              )
            : null;
        const title = getFileStem(file.name) || artifactDefaultTitle(artifactType, artifacts);
        const pendingPlacement = pendingUploadPlacementRef.current;
        const created = createArtifact({
          artifactType,
          blobRef: uploadData.blobRef ?? null,
          byteSize: uploadData.byteSize ?? file.size,
          content,
          fileName: uploadData.fileName ?? file.name,
          mimeType: uploadData.mimeType ?? (file.type || null),
          sourceDataUrl,
          title,
          position: pendingPlacement?.position ?? null,
        });
        setSelectedNodeId(created.id);
        setCanvasSelectionId(created.id);
        setFocusedMessageId(null);
        if (pendingPlacement?.relation && draft) {
          const source: SessionCanvasEndpoint =
            pendingPlacement.relation === "input"
              ? { id: created.id, kind: "artifact" }
              : { id: CANVAS_PROMPT_DRAFT_NODE_ID, kind: "draft" };
          const target: SessionCanvasEndpoint =
            pendingPlacement.relation === "input"
              ? { id: CANVAS_PROMPT_DRAFT_NODE_ID, kind: "draft" }
              : { id: created.id, kind: "artifact" };
          const result = connectCanvasBlocks(source, target);
          if (result.ok) toggleDraftArtifact(pendingPlacement.relation, created.id);
        }
        pendingUploadPlacementRef.current = null;
      } catch (error) {
        console.error(`Failed to create ${artifactType} artifact`, error);
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `Could not read the selected ${artifactType}. Try another file.`;
        setRequestError(message);
      }
    },
    [
      activeSessionId,
      artifacts,
      clearRequestError,
      connectCanvasBlocks,
      contextBudgetPolicy,
      createArtifact,
      draft,
      setFocusedMessageId,
      setCanvasSelectionId,
      setRequestError,
      toggleDraftArtifact,
    ],
  );


  const handleImageUploadChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await handleCreateArtifactFromFile("image", file);
    },
    [handleCreateArtifactFromFile],
  );

  const handleFileUploadChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await handleCreateArtifactFromFile("file", file);
    },
    [handleCreateArtifactFromFile],
  );

  const handleToggleArtifactLink = React.useCallback(
    (artifactId: string, targetMessageId: string) => {
      if (isArtifactLinkedToTarget(artifactId, targetMessageId)) {
        unlinkArtifactFromTarget(artifactId, targetMessageId);
        return;
      }
      linkArtifactToTarget(artifactId, targetMessageId);
    },
    [isArtifactLinkedToTarget, linkArtifactToTarget, unlinkArtifactFromTarget],
  );

  const getCanvasCenterPosition = React.useCallback(() => {
    const rect = flowViewportRef.current?.getBoundingClientRect();
    if (!rect || !reactFlowInstance) return null;
    return reactFlowInstance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [reactFlowInstance]);

  const connectCreatedArtifactToDraft = React.useCallback(
    (artifactId: string, relation: "input" | "output") => {
      if (!draft) return;
      const source: SessionCanvasEndpoint =
        relation === "input"
          ? { id: artifactId, kind: "artifact" }
          : { id: CANVAS_PROMPT_DRAFT_NODE_ID, kind: "draft" };
      const target: SessionCanvasEndpoint =
        relation === "input"
          ? { id: CANVAS_PROMPT_DRAFT_NODE_ID, kind: "draft" }
          : { id: artifactId, kind: "artifact" };
      const result = connectCanvasBlocks(source, target);
      if (result.ok) {
        toggleDraftArtifact(relation, artifactId);
        setConnectionError(null);
      } else {
        setConnectionError(result.message);
      }
    },
    [connectCanvasBlocks, draft, toggleDraftArtifact],
  );

  const handleAddCanvasBlock = React.useCallback(
    (block: CanvasBlockDefinition, position?: { x: number; y: number } | null) => {
      const resolvedPosition = position ?? getCanvasCenterPosition();
      setFlowRenderMode("2d");
      setConnectionError(null);
      if (block.action === "prompt") {
        handleCreatePromptNode(resolvedPosition);
        return;
      }
      if (block.action === "upload-file" || block.action === "upload-image") {
        pendingUploadPlacementRef.current = {
          position: resolvedPosition,
          relation: draft && block.category === "inputs" ? "input" : null,
        };
        if (block.category === "outputs") {
          pendingUploadPlacementRef.current.relation = "output";
        }
        if (block.action === "upload-image") imageUploadInputRef.current?.click();
        else fileUploadInputRef.current?.click();
        return;
      }
      const created = handleCreateArtifact(block.artifactType ?? "text", {
        semanticType: block.semanticType ?? null,
        position: resolvedPosition,
      });
      if (draft && block.category === "inputs") connectCreatedArtifactToDraft(created.id, "input");
      if (draft && block.category === "outputs") connectCreatedArtifactToDraft(created.id, "output");
    },
    [
      connectCreatedArtifactToDraft,
      draft,
      getCanvasCenterPosition,
      handleCreateArtifact,
      handleCreatePromptNode,
    ],
  );

  const handleCanvasDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CANVAS_BLOCK_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleCanvasDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const blockId = event.dataTransfer.getData(CANVAS_BLOCK_DRAG_MIME);
      if (!blockId || !reactFlowInstance) return;
      event.preventDefault();
      const block = getCanvasBlockDefinition(blockId);
      if (!block) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      handleAddCanvasBlock(block, position);
    },
    [handleAddCanvasBlock, reactFlowInstance],
  );

  const endpointForNode = React.useCallback(
    (nodeId: string | null | undefined): SessionCanvasEndpoint | null => {
      if (!nodeId) return null;
      if (nodeId === CANVAS_PROMPT_DRAFT_NODE_ID) return { id: nodeId, kind: "draft" };
      if (promptIndex.has(nodeId)) return { id: nodeId, kind: "prompt" };
      if (artifactIndex.has(nodeId)) return { id: nodeId, kind: "artifact" };
      const node = nodeIndex.get(nodeId);
      if (!node) return null;
      return { id: nodeId, kind: node.role === "assistant" ? "response" : "prompt" };
    },
    [artifactIndex, nodeIndex, promptIndex],
  );

  const handleCanvasConnect = React.useCallback(
    (connection: { source: string | null; target: string | null }) => {
      const source = endpointForNode(connection.source);
      const target = endpointForNode(connection.target);
      if (!source || !target) {
        setConnectionError("Choose compatible block handles.");
        return;
      }
      const result = connectCanvasBlocks(source, target);
      if (!result.ok) {
        setConnectionError(result.message);
        return;
      }
      setConnectionError(null);
      if (source.kind === "artifact" && target.kind === "draft") {
        toggleDraftArtifact("input", source.id);
      }
      if (source.kind === "draft" && target.kind === "artifact") {
        toggleDraftArtifact("output", target.id);
      }
      if (source.kind === "response" && target.kind === "artifact") {
        const responseNode = nodeIndex.get(source.id);
        const artifact = artifactIndex.get(target.id);
        if (responseNode && artifact) {
          updateArtifact(
            artifact.id,
            { content: parseArtifactOutput(artifact.semanticType, responseNode.text) },
            {
              revisionOrigin: "automatic",
              revisionAuthor: "model",
              promptId: responseNode.parentId,
              responseId: responseNode.id,
            },
          );
        }
      }
    },
    [
      artifactIndex,
      connectCanvasBlocks,
      endpointForNode,
      nodeIndex,
      toggleDraftArtifact,
      updateArtifact,
    ],
  );

  const handleArtifactConnectFromInspector = React.useCallback(
    (value: string) => {
      if (!selectedArtifact || !value) return;
      const [kind, id] = value.split(":", 2);
      if (!id) return;
      if (kind === "prompt") {
        const result = connectCanvasBlocks(
          { id: selectedArtifact.id, kind: "artifact" },
          { id, kind: "prompt" },
        );
        setConnectionError(result.ok ? null : result.message);
        return;
      }
      if (kind === "response") {
        handleCanvasConnect({ source: id, target: selectedArtifact.id });
      }
    },
    [connectCanvasBlocks, handleCanvasConnect, selectedArtifact],
  );

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
