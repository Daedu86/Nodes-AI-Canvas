import { MarkerType } from "@xyflow/react";
import { getEdgeKey, nodesShareBranch } from "@/components/assistant-ui/thread-graph/graph-geometry";
import {
  getGraphModelLabel,
  getGraphModelPalette,
} from "@/components/assistant-ui/thread-graph/graph-models";
import {
  ROOT_NODE_ID,
  type Node as ThreadGraphNodeModel,
} from "@/components/assistant-ui/thread-graph/graph-types";
import type { GraphBranchIntent } from "@/components/context/graph-branch-intent";
import {
  artifactAccent,
  CANVAS_BRANCH_RUN_NOTICE,
  CANVAS_PROMPT_DRAFT_NODE_ID,
  providerDisplay,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import { layoutThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-layout";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import type {
  BranchOperationDetail,
  BranchSpec,
} from "@/lib/thread-branching";
import type {
  SessionArtifact,
  SessionCanvasLink,
} from "@/lib/session-artifacts";

type SessionArtifactsApi = ReturnType<
  typeof import("@/components/context/session-artifacts").useSessionArtifacts
>;
type CanvasRunManagerApi = ReturnType<
  typeof import("@/components/assistant-ui/thread-graph-flow/use-canvas-run-manager").useCanvasRunManager
>;

type CanvasFlowElementsParams = {
  artifacts: SessionArtifact[];
  artifactIndex: ReadonlyMap<string, SessionArtifact>;
  canvasConversationNodes: ThreadGraphNodeModel[];
  canvasLinks: SessionCanvasLink[];
  canvasPrompts: SessionArtifact[];
  cancelCanvasPrompt: CanvasRunManagerApi["cancelPrompt"];
  canvasDraftError: string | null;
  contextLinks: SessionArtifactsApi["contextLinks"];
  deleteArtifact: SessionArtifactsApi["deleteArtifact"];
  draft: GraphBranchIntent | null;
  draftAnchorNode: ThreadGraphNodeModel | null;
  draftBranchSpec: BranchSpec | null;
  draftContextCount: number;
  draftDetail: BranchOperationDetail | null;
  getArtifactsForTarget: SessionArtifactsApi["getArtifactsForTarget"];
  handleCancelPromptDraft: () => void;
  handleCancelRun: () => void;
  handleCutEdge: (childId: string, parentId: string | null) => void;
  handleSubmitBranchDraft: () => void;
  isSubmittingBranch: boolean;
  isThreadRunning: boolean;
  linkedTargetCountByArtifact: ReadonlyMap<string, number>;
  linkEditMode: boolean;
  llmEnabled: boolean;
  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;
  overrides: { has: (nodeId: string) => boolean };
  promptIndex: ReadonlyMap<string, SessionArtifact>;
  requestError: string | null;
  runCanvasPrompt: CanvasRunManagerApi["runPrompt"];
  setDraftText: (value: string) => void;
  updateArtifact: SessionArtifactsApi["updateArtifact"];
};

export type CanvasFlowElements = {
  conversationEdges: ThreadGraphFlowEdge[];
  edges: ThreadGraphFlowEdge[];
  nodes: ThreadGraphFlowNode[];
};

export function buildCanvasFlowElements({
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
  draftContextCount,
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
}: CanvasFlowElementsParams): CanvasFlowElements {
  const conversationNodes: ThreadGraphFlowNode[] = canvasConversationNodes.map((node) => {
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

  const artifactNodes: ThreadGraphFlowNode[] = artifacts.map((artifact) => ({
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

  const canvasPromptNodes: ThreadGraphFlowNode[] = canvasPrompts.map((prompt) => {
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
        onDraftTextChange: (value: string) =>
          updateArtifact(
            prompt.id,
            { content: value },
            { revisionOrigin: "manual", revisionAuthor: "user" },
          ),
      },
    } satisfies ThreadGraphFlowNode;
  });

  const conversationEdges: ThreadGraphFlowEdge[] = canvasConversationNodes
    .filter((node) => node.parentId !== null)
    .map((node) => {
      const parentNode = node.parentId ? nodeIndex.get(node.parentId) ?? null : null;
      const isEditable = parentNode
        ? parentNode.id !== ROOT_NODE_ID && nodesShareBranch(parentNode, node)
        : false;
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

  const contextEdges: ThreadGraphFlowEdge[] = contextLinks.flatMap((link) => {
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

  const outputEdges: ThreadGraphFlowEdge[] = canvasLinks.flatMap((link) => {
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
    return [
      {
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
      },
    ];
  });

  const draftNodes: ThreadGraphFlowNode[] = (() => {
    if (!draft || !draftBranchSpec || !draftDetail) return [];
    const sourceNode =
      nodeIndex.get(draftBranchSpec.parentId ?? ROOT_NODE_ID) ?? draftAnchorNode;
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
          draftContextCount,
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
  })();

  const draftEdges: ThreadGraphFlowEdge[] = (() => {
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
  })();

  const laidOut = layoutThreadGraphFlow(
    [...conversationNodes, ...draftNodes, ...canvasPromptNodes, ...artifactNodes],
    [...conversationEdges, ...draftEdges, ...contextEdges, ...outputEdges],
  );

  return {
    conversationEdges,
    edges: laidOut.edges,
    nodes: laidOut.nodes,
  };
}
