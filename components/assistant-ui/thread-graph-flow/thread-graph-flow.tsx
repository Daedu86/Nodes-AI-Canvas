"use client";

import "@xyflow/react/dist/style.css";
import { useAssistantRuntime } from "@assistant-ui/react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import {
  BadgeHelp,
  Code2,
  Copy as CopyIcon,
  Crosshair,
  FileImage,
  FilePlus2,
  Focus,
  ImagePlus,
  ListTodo,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RotateCcw,
  Scale,
  Scissors,
  Sparkles,
  Trash2,
  Unlink2,
  Upload,
} from "lucide-react";
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
import { GraphBranchActions } from "@/components/assistant-ui/thread-graph-flow/graph-branch-actions";
import { ArtifactGraphNode } from "@/components/assistant-ui/thread-graph-flow/artifact-node";
import {
  getArtifactBadgeLabel,
  getArtifactLineCount,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import { CanvasPromptNode } from "@/components/assistant-ui/thread-graph-flow/canvas-prompt-node";
import { ThreadGraphEdge } from "@/components/assistant-ui/thread-graph-flow/thread-graph-edge";
import { ThreadGraph3D } from "@/components/assistant-ui/thread-graph-flow/thread-graph-3d";
import { layoutThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-layout";
import { ThreadGraphNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-node";
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
import { getProviderLabel } from "@/lib/llm/provider-catalog";

const nodeTypes: NodeTypes = {
  artifactNode: ArtifactGraphNode,
  promptNode: CanvasPromptNode,
  threadNode: ThreadGraphNode,
};

const edgeTypes: EdgeTypes = {
  threadEdge: ThreadGraphEdge,
};

const CANVAS_PROMPT_DRAFT_NODE_ID = "__CANVAS_PROMPT_DRAFT__";

const providerDisplay = (provider?: string | null) => {
  if (!provider) return undefined;
  return getProviderLabel(provider);
};

const scrollMessageIntoView = (messageId: string) => {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

const semanticArtifactMeta: Record<
  SessionArtifactSemanticType,
  {
    accent: string;
    icon: typeof Scale;
    label: string;
    placeholder: string;
    role: string;
    titlePrefix: string;
  }
> = {
  decision: {
    accent: "#d97706",
    icon: Scale,
    label: "Decision",
    placeholder: "Decision\nRationale\nRisks\nWhat changes if we choose differently?",
    role: "Recommendation and rationale",
    titlePrefix: "Decision",
  },
  evidence: {
    accent: "#0284c7",
    icon: Crosshair,
    label: "Evidence",
    placeholder: "Claim\nSource\nObservation\nWhy it matters",
    role: "Grounded facts and source notes",
    titlePrefix: "Evidence",
  },
  plan: {
    accent: "#0f766e",
    icon: ListTodo,
    label: "Plan",
    placeholder: "Goal\nSteps\nDependencies\nStatus",
    role: "Execution structure and next steps",
    titlePrefix: "Plan",
  },
  table: {
    accent: "#0891b2",
    icon: ListTodo,
    label: "Table",
    placeholder: "| Column | Value |\n| --- | --- |\n| Example | Ready |",
    role: "Structured rows and columns",
    titlePrefix: "Table",
  },
  question: {
    accent: "#db2777",
    icon: BadgeHelp,
    label: "Question",
    placeholder: "Open question\nWhy it is unresolved\nWhat would answer it",
    role: "Unresolved question worth tracking",
    titlePrefix: "Question",
  },
  draft: {
    accent: "#7c3aed",
    icon: NotebookPen,
    label: "Draft",
    placeholder: "Working draft\nAudience\nMessage goal\nNotes",
    role: "Working language or copy in progress",
    titlePrefix: "Draft",
  },
};

const getSemanticArtifactMeta = (semanticType?: SessionArtifactSemanticType | null) =>
  semanticType ? semanticArtifactMeta[semanticType] : null;

const semanticArtifactPresets = (
  Object.keys(semanticArtifactMeta) as SessionArtifactSemanticType[]
).map((semanticType) => ({ semanticType }));

const artifactAccent = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
  semanticType?: SessionArtifactSemanticType | null,
) => {
  const descriptor =
    typeof artifact === "string"
      ? { artifactType: artifact, semanticType: semanticType ?? null }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return getSemanticArtifactMeta(descriptor.semanticType)?.accent ?? "#7c3aed";
  }
  switch (descriptor.artifactType) {
    case "code":
      return "#0f766e";
    case "image":
      return "#db2777";
    case "file":
      return "#2563eb";
    default:
      return "#7c3aed";
  }
};

const artifactTypeLabel = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => getArtifactBadgeLabel(artifact);

const artifactDefaultTitle = (
  artifactType: SessionArtifact["artifactType"],
  existingArtifacts: SessionArtifact[],
  semanticType?: SessionArtifactSemanticType | null,
) => {
  const count =
    existingArtifacts.filter(
      (artifact) =>
        artifact.artifactType === artifactType &&
        (artifactType !== "text" || (artifact.semanticType ?? null) === (semanticType ?? null)),
    ).length + 1;
  const semanticMeta = artifactType === "text" ? getSemanticArtifactMeta(semanticType) : null;
  switch (artifactType) {
    case "code":
      return `Code Context ${count}`;
    case "image":
      return `Image Context ${count}`;
    case "file":
      return `File Context ${count}`;
    default:
      return `${semanticMeta?.titlePrefix ?? "Text Context"} ${count}`;
  }
};

const artifactContentLabel = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => {
  const descriptor =
    typeof artifact === "string"
      ? { artifactType: artifact, semanticType: null as SessionArtifactSemanticType | null }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return `${getSemanticArtifactMeta(descriptor.semanticType)?.label ?? "Text"} notes`;
  }
  switch (descriptor.artifactType) {
    case "image":
      return "Notes";
    case "file":
      return "Extracted text / notes";
    default:
      return "Content";
  }
};

const artifactContentPlaceholder = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => {
  const descriptor =
    typeof artifact === "string"
      ? { artifactType: artifact, semanticType: null as SessionArtifactSemanticType | null }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return (
      getSemanticArtifactMeta(descriptor.semanticType)?.placeholder ??
      "Write reusable context here..."
    );
  }
  switch (descriptor.artifactType) {
    case "code":
      return "Paste code or config here...";
    case "image":
      return "Describe what matters about this image...";
    case "file":
      return "Review or refine the extracted file text here...";
    default:
      return "Write reusable context here...";
  }
};

const formatByteSize = (byteSize?: number | null) => {
  if (!byteSize || byteSize <= 0) return null;
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(byteSize >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

const trimArtifactPreview = (artifact: Pick<SessionArtifact, "artifactType" | "content" | "fileName">) => {
  const compact = artifact.content.replace(/\s+/g, " ").trim();
  if (compact.length > 0) return compact;
  if (artifact.artifactType === "image") {
    return artifact.fileName ? `Image: ${artifact.fileName}` : "Image artifact";
  }
  if (artifact.artifactType === "file") {
    return artifact.fileName ? `File: ${artifact.fileName}` : "File artifact";
  }
  return "Empty artifact";
};

const getFileStem = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem.length > 0 ? stem : fileName;
};

const textLikeExtensions = new Set([
  "txt",
  "md",
  "mdx",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "cs",
  "php",
  "sql",
  "sh",
  "ps1",
  "env",
  "gitignore",
  "lock",
]);

const isTextLikeFile = (file: File) => {
  const mime = file.type.toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("markdown") ||
    mime.includes("csv")
  ) {
    return true;
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : file.name.toLowerCase();
  return extension ? textLikeExtensions.has(extension) : false;
};

const estimateDataUrlBytes = (dataUrl: string) => {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Math.ceil((base64.length * 3) / 4);
};

const buildImagePreviewDataUrl = async (
  file: File,
  maxBytes: number,
  maxDimension: number,
) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to load image preview"));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to prepare image preview canvas");
    }

    const dimensionCandidates = Array.from(
      new Set([
        maxDimension,
        Math.min(maxDimension, 640),
        Math.min(maxDimension, 520),
        Math.min(maxDimension, 420),
        Math.min(maxDimension, 320),
      ].filter((value) => value > 0)),
    );
    const qualities = [0.74, 0.62, 0.5, 0.38, 0.28];

    let bestDataUrl = "";
    let bestByteDelta = Number.POSITIVE_INFINITY;

    for (const dimension of dimensionCandidates) {
      const scale = Math.min(1, dimension / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL("image/webp", quality);
        const candidateBytes = estimateDataUrlBytes(candidate);
        if (!bestDataUrl || Math.abs(candidateBytes - maxBytes) < bestByteDelta) {
          bestDataUrl = candidate;
          bestByteDelta = Math.abs(candidateBytes - maxBytes);
        }
        if (candidateBytes <= maxBytes) {
          return candidate;
        }
      }
    }
    return bestDataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const trimStoredArtifactContent = (value: string, maxChars: number) => {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

const getArtifactUploadLimit = (
  artifactType: "image" | "file",
  policy: ReturnType<typeof getContextBudgetPolicy>,
) =>
  artifactType === "image" ? policy.maxUploadImageBytes : policy.maxUploadFileBytes;

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
    <span>{label}</span>
  </span>
);

const canvasToolbarButtonClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/92 px-3 py-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-background";

const canvasToolbarIconButtonClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/92 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground";


type FlowSpotlightMode = "all" | "assistant" | "user" | "bridge" | "edited";
type FlowDensityMode = "overview" | "focus";
type FlowRenderMode = "2d" | "3d";

const flowFilterLabel: Record<FlowSpotlightMode, string> = {
  all: "All",
  assistant: "Assistant",
  user: "User",
  bridge: "Bridge",
  edited: "Edited",
};

const CANVAS_BRANCH_RUN_NOTICE =
  "Submitting will stop the current run before creating the branch.";
const CANVAS_BRANCH_CANCEL_FAILURE =
  "The current assistant run could not be cancelled. Wait for it to finish, then try again.";

const isFlowViewport = (value: Viewport | null): value is Viewport =>
  !!value &&
  typeof value.x === "number" &&
  typeof value.y === "number" &&
  typeof value.zoom === "number";

const readFlowRenderMode = (storageKey: string): FlowRenderMode => {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "3d") return "3d";
    return "2d";
  } catch {
    return "2d";
  }
};

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
    artifacts,
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
  const artifactIndex = React.useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact] as const)),
    [artifacts],
  );
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
    ];
  }, [artifacts, nodes]);

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

  const filterCounts = React.useMemo(() => {
    const counts: Record<FlowSpotlightMode, number> = {
      all: canvasConversationNodes.length + artifacts.length,
      assistant: 0,
      user: 0,
      bridge: 0,
      edited: 0,
    };
    canvasConversationNodes.forEach((node) => {
      if (node.role === "assistant") counts.assistant += 1;
      if (node.role === "user") counts.user += 1;
      if (node.isBridge) counts.bridge += 1;
      if (node.editedFromId) counts.edited += 1;
    });
    return counts;
  }, [artifacts.length, canvasConversationNodes]);

  const matchesSpotlight = React.useCallback(
    (node: ThreadGraphNodeModel) => {
      switch (spotlight) {
        case "assistant":
          return node.role === "assistant";
        case "user":
          return node.role === "user";
        case "bridge":
          return Boolean(node.isBridge);
        case "edited":
          return Boolean(node.editedFromId);
        default:
          return true;
      }
    },
    [spotlight],
  );

  const selectedLineage = React.useMemo(() => {
    if (!selectedNodeId || selectedArtifact) return new Set<string>();
    const lineage = new Set<string>([selectedNodeId]);

    let currentId: string | null = selectedNodeId;
    while (currentId) {
      const currentNode = nodeIndex.get(currentId);
      const parentId = currentNode?.parentId ?? null;
      if (!parentId || lineage.has(parentId)) break;
      lineage.add(parentId);
      currentId = parentId;
    }

    const queue = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      canvasConversationNodes.forEach((node) => {
        if (node.parentId === current && !lineage.has(node.id)) {
          lineage.add(node.id);
          queue.push(node.id);
        }
      });
    }

    return lineage;
  }, [canvasConversationNodes, nodeIndex, selectedArtifact, selectedNodeId]);

  const focusPathNodeIds = React.useMemo(() => {
    if (!selectedNodeId) return new Set<string>();

    const focusIds = new Set<string>([selectedNodeId]);

    const addAncestors = (startId: string | null) => {
      let currentId = startId;
      while (currentId) {
        if (focusIds.has(currentId)) {
          const parentId = nodeIndex.get(currentId)?.parentId ?? null;
          if (!parentId || focusIds.has(parentId)) {
            break;
          }
        }
        focusIds.add(currentId);
        const parentId = nodeIndex.get(currentId)?.parentId ?? null;
        if (!parentId) break;
        currentId = parentId;
      }
    };

    if (selectedArtifact) {
      selectedContextLinkedMessageIds.forEach((messageId) => {
        focusIds.add(messageId);
        addAncestors(messageId);
      });
      return focusIds;
    }

    addAncestors(selectedNodeId);

    canvasConversationNodes.forEach((node) => {
      if (node.parentId === selectedNodeId) {
        focusIds.add(node.id);
      }
    });

    selectedContextArtifactIds.forEach((artifactId) => {
      focusIds.add(artifactId);
    });

    return focusIds;
  }, [
    nodeIndex,
    canvasConversationNodes,
    selectedArtifact,
    selectedContextArtifactIds,
    selectedContextLinkedMessageIds,
    selectedNodeId,
  ]);

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
      if (artifactIndex.has(nodeId)) {
        setFocusedMessageId(null);
        return;
      }
      if (nodeIndex.has(nodeId)) {
        setFocusedMessageId(nodeId);
      }
    },
    [artifactIndex, nodeIndex, setCanvasSelectionId, setFocusedMessageId],
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
    if (!nodeIndex.has(canvasSelectionId) && !artifactIndex.has(canvasSelectionId)) {
      return;
    }
    applyCanvasSelection(canvasSelectionId);
  }, [applyCanvasSelection, artifactIndex, canvasSelectionId, nodeIndex, selectedNodeId]);

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

  const relatedContextIds = React.useMemo(() => {
    const related = new Set<string>();
    selectedContextArtifactIds.forEach((id) => related.add(id));
    selectedContextLinkedMessageIds.forEach((id) => related.add(id));
    return related;
  }, [selectedContextArtifactIds, selectedContextLinkedMessageIds]);

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
      const targetNode = nodeIndex.get(link.targetMessageId);
      if (!artifact || !targetNode) return [];
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
  }, [artifactIndex, contextLinks, nodeIndex]);

  const baseOutputEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return canvasLinks.flatMap((link) => {
      if (link.relation !== "output") return [];
      const artifact = artifactIndex.get(link.artifactId);
      const sourceId = link.responseId ?? link.promptId;
      if (!artifact || !sourceId) return [];
      const sourceExists =
        sourceId === CANVAS_PROMPT_DRAFT_NODE_ID || nodeIndex.has(sourceId);
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
  }, [artifactIndex, canvasLinks, nodeIndex]);

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
        [...baseConversationNodes, ...baseDraftNodes, ...baseArtifactNodes],
        [...baseConversationEdges, ...baseDraftEdges, ...baseContextEdges, ...baseOutputEdges],
      ),
    [
      baseArtifactNodes,
      baseContextEdges,
      baseConversationEdges,
      baseOutputEdges,
      baseConversationNodes,
      baseDraftEdges,
      baseDraftNodes,
    ],
  );

  const visibleNodeIds = React.useMemo(() => {
    if (densityMode !== "focus" || !selectedNodeId) {
      return null;
    }
    return focusPathNodeIds;
  }, [densityMode, focusPathNodeIds, selectedNodeId]);

  const visibleFlowNodes = React.useMemo(
    () =>
      visibleNodeIds
        ? flowNodes.filter((node) => visibleNodeIds.has(node.id))
        : flowNodes,
    [flowNodes, visibleNodeIds],
  );

  const visibleFlowEdges = React.useMemo(
    () =>
      visibleNodeIds
        ? flowEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
        : flowEdges,
    [flowEdges, visibleNodeIds],
  );

  const decoratedFlowNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    return visibleFlowNodes.map((node) => {
      const originalNode = nodeIndex.get(node.id);
      const filterMatched = originalNode ? matchesSpotlight(originalNode) : true;
      const emphasis: NonNullable<ThreadGraphFlowNode["data"]["emphasis"]> =
        selectedNodeId == null
          ? filterMatched || spotlight === "all" || node.data.kind === "artifact"
            ? "normal"
            : "muted"
          : node.id === selectedNodeId
            ? "selected"
            : selectedLineage.has(node.id) || relatedContextIds.has(node.id)
              ? "lineage"
              : "muted";

      return {
        ...node,
        data: {
          ...node.data,
          emphasis,
          filterMatched,
        },
      };
    });
  }, [
    matchesSpotlight,
    nodeIndex,
    relatedContextIds,
    selectedLineage,
    selectedNodeId,
    spotlight,
    visibleFlowNodes,
  ]);

  const decoratedFlowEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return visibleFlowEdges.map((edge) => {
      const sourceInLineage = selectedLineage.has(edge.source) || relatedContextIds.has(edge.source);
      const targetInLineage = selectedLineage.has(edge.target) || relatedContextIds.has(edge.target);
      const sourceMatched = decoratedFlowNodes.find((node) => node.id === edge.source)?.data.filterMatched ?? true;
      const targetMatched = decoratedFlowNodes.find((node) => node.id === edge.target)?.data.filterMatched ?? true;

      const emphasis: "normal" | "selected" | "lineage" | "muted" =
        selectedNodeId == null
          ? spotlight === "all" || (sourceMatched && targetMatched) || edge.data?.tone === "context"
            ? "normal"
            : "muted"
          : sourceInLineage && targetInLineage
            ? edge.target === selectedNodeId || edge.source === selectedNodeId
              ? "selected"
              : "lineage"
            : "muted";

      return {
        ...edge,
        data: {
          ...edge.data,
          emphasis,
        },
      };
    });
  }, [decoratedFlowNodes, relatedContextIds, selectedLineage, selectedNodeId, spotlight, visibleFlowEdges]);

  const graphStructureSignature = React.useMemo(
    () =>
      [
        decoratedFlowNodes
          .map((node) => `${node.id}:${String(node.data.branchId ?? "")}:${node.data.kind ?? "message"}`)
          .join("|"),
        decoratedFlowEdges.map((edge) => `${edge.id}:${edge.source}->${edge.target}`).join("|"),
      ].join("::"),
    [decoratedFlowEdges, decoratedFlowNodes],
  );

  const treeStructureSignature = React.useMemo(
    () =>
      [
        canvasConversationNodes.map((node) => `${node.id}:${String(node.branchId ?? "")}`).join("|"),
        baseConversationEdges.map((edge) => `${edge.source}->${edge.target}`).join("|"),
      ].join("::"),
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
    const selectedOperations = selectedMessageNode
      ? getAllowedBranchOperations(selectedMessageNode)
      : [];
    const anchor =
      selectedMessageNode && selectedOperations.length > 0
        ? selectedMessageNode
        : nodeIndex.get(ROOT_NODE_ID) ?? null;
    if (!anchor) {
      const message = "Unable to create a prompt node from this canvas state.";
      setCanvasDraftError(message);
      setRequestError(message);
      return;
    }
    const operation = getAllowedBranchOperations(anchor)[0];
    if (!operation) {
      const message = "Unable to branch from the selected canvas node.";
      setCanvasDraftError(message);
      setRequestError(message);
      return;
    }
    clearRequestError();
    setCanvasDraftError(null);
    const initialText =
      anchor.role === "user" && operation !== "create-follow-up-prompt" ? anchor.text : "";
    beginDraft(anchor.id, operation, initialText, { position: position ?? null });
    setFlowRenderMode("2d");
    applyCanvasSelection(anchor.id);
  }, [
    applyCanvasSelection,
    beginDraft,
    clearRequestError,
    nodeIndex,
    selectedMessageNode,
    setRequestError,
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

  const toggleToolbarMenu = React.useCallback((menu: "add" | "tools") => {
    setToolbarMenu((current) => (current === menu ? null : menu));
  }, []);

  const handleToolbarArtifactCreate = React.useCallback(
    (
      artifactType: SessionArtifact["artifactType"],
      options?: { semanticType?: SessionArtifactSemanticType | null },
    ) => {
      setToolbarMenu(null);
      handleCreateArtifact(artifactType, options);
    },
    [handleCreateArtifact],
  );

  const handleToolbarUpload = React.useCallback((artifactType: "image" | "file") => {
    setToolbarMenu(null);
    if (artifactType === "image") {
      imageUploadInputRef.current?.click();
      return;
    }
    fileUploadInputRef.current?.click();
  }, []);

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
      if (artifactIndex.has(nodeId)) return { id: nodeId, kind: "artifact" };
      const node = nodeIndex.get(nodeId);
      if (!node) return null;
      return { id: nodeId, kind: node.role === "assistant" ? "response" : "prompt" };
    },
    [artifactIndex, nodeIndex],
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
  const selectedArtifactSemanticMeta = React.useMemo(
    () =>
      selectedArtifact?.artifactType === "text"
        ? getSemanticArtifactMeta(selectedArtifact.semanticType ?? null)
        : null,
    [selectedArtifact],
  );
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
        <aside
          ref={toolbarMenuRef}
          className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-[24px] border border-white/70 bg-white/84 p-3 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-slate-950/78 lg:w-[18rem] lg:max-w-[22rem]"
        >
        <div className="min-w-0 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-200">
              Canvas
            </span>
            {selectedNodeId ? (
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
                Focus
              </span>
            ) : null}
            {densityMode === "focus" ? (
              <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Path mode
              </span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{selectedCanvasLabel}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{selectedCanvasPreview}</p>
          {selectedBranchPathLabel ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
              <span className="font-medium text-foreground/80">Path:</span> {selectedBranchPathLabel}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
              {visibleCanvasNodeCount} / {flowNodes.length} nodes
            </span>
            <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-700">
              {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"}
            </span>
            {hiddenCanvasNodeCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
                {hiddenCanvasNodeCount} hidden
              </span>
            ) : null}
          </div>
        </div>
        <div
          className="flex flex-col gap-3 border-b border-border/60 pb-3"
        >
          {connectionError ? (
            <p role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
              {connectionError}
            </p>
          ) : null}
          {showCanvasPromptCta ? (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-55"
              onClick={() => handleCreatePromptNode()}
              disabled={!llmEnabled || isSubmittingBranch}
            >
              <Plus className="h-4 w-4 text-emerald-600" />
              <span>Create prompt node</span>
            </button>
          ) : null}
          <div className="flex items-center rounded-full border border-border/60 bg-background/92 p-1 text-[11px] font-medium text-muted-foreground shadow-sm">
            <button
              type="button"
              className={`inline-flex items-center rounded-full px-3 py-2 transition-colors ${
                flowRenderMode === "2d"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFlowRenderMode("2d")}
              aria-label="Switch canvas to 2D"
            >
              2D
            </button>
            <button
              type="button"
              className={`inline-flex items-center rounded-full px-3 py-2 transition-colors ${
                flowRenderMode === "3d"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFlowRenderMode("3d")}
              aria-label="Switch canvas to 3D"
            >
              3D
            </button>
          </div>
          <div className="relative w-full">
            <button
              type="button"
              aria-expanded={toolbarMenu === "tools"}
              aria-haspopup="menu"
              aria-label="Canvas tools"
              className={`${canvasToolbarIconButtonClassName} w-full justify-center`}
              onClick={() => toggleToolbarMenu("tools")}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tools</span>
            </button>
            {toolbarMenu === "tools" ? (
              <div className="mt-2 w-full rounded-[18px] border border-white/70 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-slate-950/92">
                <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Canvas tools
                </p>
                <div className="space-y-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
                    onClick={() => {
                      setToolbarMenu(null);
                      setLinkEditMode((prev) => !prev);
                    }}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground/80">
                      <Scissors className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {linkEditMode ? "Finish Editing" : "Edit Links"}
                      </span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        Cut and restore parent-child links from the graph.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
                    onClick={() => {
                      setToolbarMenu(null);
                      handleCopyJson();
                    }}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground/80">
                      <CopyIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">Copy JSON</span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        Export the visible graph snapshot for debugging or handoff.
                      </span>
                    </span>
                  </button>
                </div>
                {legendItems.length > 0 ? (
                  <>
                    <div className="my-2 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
                    <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-1">
                      {legendItems.slice(0, 4).map((item) => (
                        <LegendItem key={item.key} color={item.swatch} label={item.label} />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {selectedArtifact || (selectedFlowNode && selectedMessageNode) || linkEditMode || overrides.size > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Canvas focus
              </p>
              <p className="text-xs text-foreground/80">
                {selectedNodeId
                  ? "Inspector for the current node or artifact."
                  : "Select a node or artifact to inspect and branch from it."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(flowFilterLabel) as FlowSpotlightMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors ${
                  spotlight === mode
                    ? "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:bg-background"
                }`}
                onClick={() => setSpotlight(mode)}
              >
                <span>{flowFilterLabel[mode]}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] dark:bg-white/10">
                  {filterCounts[mode]}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={!selectedNodeId}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                densityMode === "focus"
                  ? "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:bg-background"
              }`}
              onClick={() =>
                setDensityMode((current) => (current === "focus" ? "overview" : "focus"))
              }
            >
              <Focus className="h-3.5 w-3.5" />
              <span>{densityMode === "focus" ? "Focus path" : "Enter focus"}</span>
            </button>
          </div>
          {linkEditMode ? (
            <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-700 dark:text-rose-200">
              Link edit mode is on. Use <span className="font-semibold">Cut selected link</span> from the inspector, then restore it when needed.
            </p>
          ) : null}
          {overrides.size > 0 ? (
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/90 px-2.5 py-1.5 text-[11px] hover:bg-background"
              onClick={resetLinks}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Cuts ({overrides.size})</span>
            </button>
          ) : null}
          <div
            ref={inspectorScrollRef}
            className="max-h-[min(34rem,calc(100vh-11rem))] overflow-y-auto rounded-[26px] border border-border/60 bg-background/85 px-3 py-3 shadow-sm"
          >
            {selectedArtifact ? (
              <div className="space-y-3">
                <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">Synchronization</p>
                      <p className="text-[11px] text-muted-foreground">Auto updates only after run completion.</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs"
                      onClick={() =>
                        setArtifactSyncMode(
                          selectedArtifact.id,
                          selectedArtifact.syncMode === "paused" ? "auto" : "paused",
                        )
                      }
                    >
                      {selectedArtifact.syncMode === "paused" ? "Resume auto" : "Pause auto"}
                    </button>
                  </div>
                  <label className="grid gap-1 text-xs text-foreground">
                    <span>Connect to…</span>
                    <select
                      aria-label="Connect selected artifact to"
                      defaultValue=""
                      className="h-9 rounded-md border border-border/60 bg-background px-2 text-xs"
                      onChange={(event) => {
                        handleArtifactConnectFromInspector(event.target.value);
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="" disabled>Select a prompt or response</option>
                      {canvasConversationNodes
                        .filter((node) => node.id !== ROOT_NODE_ID && !node.isBridge)
                        .map((node) => (
                          <option
                            key={node.id}
                            value={`${node.role === "assistant" ? "response" : "prompt"}:${node.id}`}
                          >
                            {node.role === "assistant" ? "Output from" : "Input to"} · {node.text.replace(/\s+/g, " ").slice(0, 56) || node.id}
                          </option>
                        ))}
                    </select>
                  </label>
                  {selectedArtifact.revisions && selectedArtifact.revisions.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground">Revision history</p>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {[...selectedArtifact.revisions].reverse().map((revision) => (
                          <button
                            key={revision.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                            onClick={() => restoreArtifactRevision(selectedArtifact.id, revision.id)}
                          >
                            <span className="truncate">{revision.content.replace(/\s+/g, " ").slice(0, 58) || "Empty"}</span>
                            <span className="shrink-0 text-muted-foreground">{revision.origin}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{
                          borderColor: `${artifactAccent(selectedArtifact)}55`,
                          color: artifactAccent(selectedArtifact),
                        }}
                      >
                        {artifactTypeLabel(selectedArtifact)}
                      </span>
                      <span className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {selectedContextLinkedMessageIds.size} linked target{selectedContextLinkedMessageIds.size === 1 ? "" : "s"}
                      </span>
                      {selectedArtifactSize ? (
                        <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {selectedArtifactSize}
                        </span>
                      ) : null}
                      {selectedArtifactPreviewSize ? (
                        <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          preview {selectedArtifactPreviewSize}
                        </span>
                      ) : null}
                      {selectedArtifactStatChips.slice(0, 2).map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                      {selectedArtifact.artifactType === "code" && selectedArtifactLineCount > 0 ? (
                        <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {selectedArtifactLineCount} lines
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canvasLinks.some((link) => link.relation === "output" && link.artifactId === selectedArtifact.id) ? (
                      <button
                        type="button"
                        className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
                        onClick={() => {
                          const outputLink = canvasLinks.find(
                            (link) => link.relation === "output" && link.artifactId === selectedArtifact.id,
                          );
                          if (outputLink) removeCanvasLink(outputLink.id);
                        }}
                      >
                        Disconnect output
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-500/15"
                      onClick={() => {
                        deleteArtifact(selectedArtifact.id);
                        applyCanvasSelection(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                    <Sparkles className="h-4 w-4 text-violet-600" />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[1.4fr,0.8fr]">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">Title</span>
                    <input
                      type="text"
                      aria-label="Artifact title"
                      value={selectedArtifact.title}
                      onChange={(event) => updateArtifact(selectedArtifact.id, { title: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                    />
                  </label>
                  {selectedArtifact.artifactType === "text" ? (
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">Semantic type</span>
                      <select
                        aria-label="Artifact semantic type"
                        value={selectedArtifact.semanticType ?? "draft"}
                        onChange={(event) =>
                          updateArtifact(selectedArtifact.id, {
                            semanticType: event.target.value as SessionArtifactSemanticType,
                          })
                        }
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                      >
                        {semanticArtifactPresets.map(({ semanticType }) => (
                          <option key={semanticType} value={semanticType}>
                            {getSemanticArtifactMeta(semanticType)?.label ?? semanticType}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : selectedArtifact.artifactType === "code" ? (
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">Language</span>
                      <input
                        type="text"
                        aria-label="Artifact language"
                        value={selectedArtifact.language ?? ""}
                        onChange={(event) => updateArtifact(selectedArtifact.id, { language: event.target.value })}
                        placeholder="ts"
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                      />
                    </label>
                  ) : (
                    <div className="space-y-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground/80">Artifact metadata</p>
                      <div className="space-y-1">
                        {selectedArtifact.fileName ? <p>File: {selectedArtifact.fileName}</p> : null}
                        {selectedArtifact.mimeType ? <p>MIME: {selectedArtifact.mimeType}</p> : null}
                        {selectedArtifactSize ? <p>Size: {selectedArtifactSize}</p> : null}
                        {selectedArtifactPreviewSize ? (
                          <p>
                            Preview: {selectedArtifactPreviewSize} / budget {formatBytes(contextBudgetPolicy.maxImagePreviewBytes)}
                          </p>
                        ) : null}
                        {selectedArtifact.blobRef ? <p>Original stored in blob store</p> : null}
                        {!selectedArtifact.fileName && !selectedArtifact.mimeType && !selectedArtifactSize && !selectedArtifactPreviewSize && !selectedArtifact.blobRef ? (
                          <p>No upload metadata stored for this artifact.</p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                {selectedArtifact.artifactType === "image" && selectedArtifact.sourceDataUrl ? (
                  <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                      <FileImage className="h-4 w-4 text-pink-600" />
                      <span>Image preview</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={selectedArtifact.title}
                      src={selectedArtifact.sourceDataUrl}
                      className="max-h-48 w-full rounded-xl border border-border/50 object-contain bg-muted/20"
                    />
                  </div>
                ) : null}
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {selectedArtifact.artifactType === "text"
                      ? artifactContentLabel(selectedArtifact)
                      : artifactContentLabel(selectedArtifact)}
                  </span>
                  <textarea
                    aria-label={
                      selectedArtifact.artifactType === "text"
                        ? "Artifact content"
                        : selectedArtifact.artifactType === "image"
                          ? "Artifact notes"
                          : selectedArtifact.artifactType === "file"
                            ? "Artifact extracted text"
                            : "Artifact content"
                    }
                    rows={6}
                    value={selectedArtifact.content}
                    onChange={(event) => updateArtifact(selectedArtifact.id, { content: event.target.value })}
                    placeholder={artifactContentPlaceholder(selectedArtifact)}
                    className="min-h-[136px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                  />
                </label>
                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground/80">Links</p>
                    {selectedArtifactSemanticMeta ? (
                      <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {selectedArtifactSemanticMeta.label}
                      </span>
                    ) : null}
                  </div>
                  {attachableTargets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No available targets.</p>
                  ) : (
                    <div className="max-h-[148px] space-y-2 overflow-y-auto pr-1">
                      {attachableTargets.map((target) => {
                        const isLinked = isArtifactLinkedToTarget(selectedArtifact.id, target.id);
                        return (
                          <div
                            key={target.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                              isLinked
                                ? "border-violet-500/30 bg-violet-500/10"
                                : "border-border/60 bg-background"
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                  {target.role}
                                </span>
                                <span className="truncate text-xs font-medium text-foreground/85">
                                  {target.preview}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={`${isLinked ? "Detach" : "Attach"} target ${target.id}`}
                                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${
                                  isLinked
                                    ? "border-violet-500/35 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15"
                                    : "border-border/60 bg-background hover:bg-muted"
                                }`}
                                onClick={() => handleToggleArtifactLink(selectedArtifact.id, target.id)}
                              >
                                {isLinked ? <Unlink2 className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                                <span>{isLinked ? "Detach" : "Attach"}</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Open target ${target.id}`}
                                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                                onClick={() => applyCanvasSelection(target.id)}
                              >
                                <span>Open</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : selectedFlowNode && selectedMessageNode ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{
                          borderColor: `${selectedFlowNode.data.accent ?? "#64748b"}55`,
                          color: selectedFlowNode.data.accent ?? "#64748b",
                        }}
                      >
                        {selectedFlowNode.data.role}
                      </span>
                      {selectedFlowNode.data.branchId ? (
                        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {String(selectedFlowNode.data.branchId)}
                        </span>
                      ) : null}
                      {selectedFlowNode.data.isCut ? (
                        <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-rose-700">
                          Cut
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedFlowNode.data.isCut
                        ? "This node is temporarily disconnected from its original parent."
                        : "Selecting a node spotlights both its lineage and any linked context artifacts."}
                    </p>
                  </div>
                  <Sparkles className="h-4 w-4 text-sky-600" />
                </div>
                <p className="line-clamp-2 text-sm text-foreground/90">
                  {selectedPreview || "No preview available"}
                </p>
                {selectedBranchPathLabel ? (
                  <p className="rounded-2xl border border-border/60 bg-background/85 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground/80">Path:</span> {selectedBranchPathLabel}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {selectedNodeId !== ROOT_NODE_ID ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                      onClick={handleOpenSelectedInChat}
                    >
                      <Focus className="h-3.5 w-3.5" />
                      <span>Open in chat</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    onClick={handleFocusSelected}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    <span>Fit selection</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    onClick={handleResetView}
                  >
                    <span>Reset view</span>
                  </button>
                  {linkEditMode && !selectedOverride && selectedParentId ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-500/15"
                      onClick={handleCutSelected}
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      <span>Cut selected link</span>
                    </button>
                  ) : null}
                  {selectedOverride ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-500/15"
                      onClick={handleRestoreSelected}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore link</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    onClick={() => applyCanvasSelection(null)}
                  >
                    <span>Clear focus</span>
                  </button>
                </div>
                <GraphBranchActions
                  activeDraft={
                    draft && draft.anchorId === selectedMessageNode.id
                      ? { operation: draft.operation, text: draft.text }
                      : null
                  }
                  busy={isSubmittingBranch}
                  contextCount={selectedContextArtifacts.length}
                  disabled={!llmEnabled}
                  details={selectedBranchOptions}
                  onCancelDraft={handleCancelPromptDraft}
                  onCancelRun={isThreadRunning ? handleCancelRun : undefined}
                  onChooseOperation={handleChooseBranchOperation}
                  onDraftTextChange={setDraftText}
                  onSubmitDraft={handleSubmitBranchDraft}
                  runInterruptionNote={isThreadRunning ? CANVAS_BRANCH_RUN_NOTICE : null}
                />
                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/80">Linked context artifacts</p>
                    <p className="text-xs text-muted-foreground">
                      Attach reusable artifacts to this node. Branches created from here will include the linked artifacts as additional LLM context.
                    </p>
                  </div>
                  {artifacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No artifacts yet. Create one from the header actions above.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {artifacts.map((artifact) => {
                        const isLinked = isArtifactLinkedToTarget(artifact.id, selectedMessageNode.id);
                        return (
                          <div
                            key={artifact.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                              isLinked
                                ? "border-violet-500/30 bg-violet-500/10"
                                : "border-border/60 bg-background"
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                                  style={{
                                    borderColor: `${artifactAccent(artifact)}44`,
                                    color: artifactAccent(artifact),
                                  }}
                                >
                                  {artifactTypeLabel(artifact)}
                                </span>
                                <span className="truncate text-xs font-medium text-foreground/85">
                                  {artifact.title}
                                </span>
                              </div>
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {trimArtifactPreview(artifact)}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${
                                isLinked
                                  ? "border-violet-500/35 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15"
                                  : "border-border/60 bg-background hover:bg-muted"
                              }`}
                              onClick={() => handleToggleArtifactLink(artifact.id, selectedMessageNode.id)}
                            >
                              {isLinked ? <Unlink2 className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                              <span>{isLinked ? "Detach" : "Attach"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-[24px] border border-dashed border-border/70 bg-background/80 px-4 py-5 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Nothing selected
                </p>
                <p className="text-sm font-medium text-foreground/85">
                  Pick a message node to branch, or select an artifact to shape reusable context.
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  The canvas is your structured input layer. Use it to build artifacts the model can reason over without losing human-readable form.
                </p>
              </div>
            )}
          </div>
        </div>
        ) : null}
        </aside>
        <div
          ref={flowViewportRef}
          className="relative min-h-[28rem] flex-1 lg:min-h-0"
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
        {flowRenderMode === "3d" ? (
          <ThreadGraph3D
            nodes={decoratedFlowNodes}
            edges={decoratedFlowEdges}
            selectedNodeId={selectedNodeId}
            onSelectNode={applyCanvasSelection}
          />
        ) : (
          <>
            <ReactFlow
              key={`flow:${activeSessionId}:${graphStructureSignature}`}
              nodes={decoratedFlowNodes}
              edges={decoratedFlowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView={!isFlowViewport(storedViewport)}
              defaultViewport={storedViewport ?? { x: 0, y: 0, zoom: 1 }}
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.3}
              maxZoom={1.6}
              onlyRenderVisibleElements
              nodesDraggable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              onInit={setReactFlowInstance}
              onConnect={handleCanvasConnect}
              onMoveEnd={(_, viewport) => {
                setStoredViewport(viewport);
              }}
              onNodeDragStop={(_, node) => {
                const position = { x: node.position.x, y: node.position.y };
                if (node.data?.kind === "artifact") {
                  updateArtifact(node.id, { position });
                } else if (node.data?.kind === "prompt-draft") {
                  setDraftPosition(position);
                }
              }}
              onSelectionChange={({ nodes: selectedNodes }) => {
                if (selectedNodes[0]?.id) {
                  applyCanvasSelection(selectedNodes[0].id);
                }
              }}
              onNodeClick={(_, node) => {
                applyCanvasSelection(node.id);
              }}
              onNodeDoubleClick={(_, node) => {
                if (node.data.kind === "artifact" || node.id === ROOT_NODE_ID) return;
                applyCanvasSelection(node.id);
                setViewMode("split");
                scrollMessageIntoView(node.id);
              }}
              onPaneClick={() => applyCanvasSelection(null)}
              className="overflow-hidden rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.06),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.92))] shadow-[0_30px_110px_-60px_rgba(15,23,42,0.5)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.92))]"
              defaultEdgeOptions={{
                animated: false,
              }}
            >
              <Background color="rgba(148,163,184,0.18)" gap={24} size={1.15} />
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
              <div className="pointer-events-auto rounded-full border border-white/70 bg-white/82 px-3 py-1 text-[11px] text-muted-foreground shadow-[0_18px_48px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
                Drag nodes directly on the stage. The canvas is the main workspace.
              </div>
            </div>
          </>
        )}
        </div>
      </div>
      </div>
    </section>
  );
}
