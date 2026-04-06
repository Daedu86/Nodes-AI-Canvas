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
  Code2,
  Bot,
  Copy as CopyIcon,
  Crosshair,
  FileImage,
  FilePlus2,
  Focus,
  ImagePlus,
  RotateCcw,
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
import { GraphBranchActions } from "@/components/assistant-ui/thread-graph-flow/graph-branch-actions";
import { ArtifactGraphNode } from "@/components/assistant-ui/thread-graph-flow/artifact-node";
import {
  getArtifactCodeSample,
  getArtifactHeadline,
  getArtifactHighlights,
  getArtifactIntentLabel,
  getArtifactLineCount,
  getArtifactReadableRole,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import { ThreadGraphEdge } from "@/components/assistant-ui/thread-graph-flow/thread-graph-edge";
import { layoutThreadGraphFlow } from "@/components/assistant-ui/thread-graph-flow/thread-graph-layout";
import { ThreadGraphNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-node";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import type { EdgeConnectorInfo, LinkConnectorPref } from "@/components/assistant-ui/thread-graph/graph-types";
import { useGraphBranchIntent } from "@/components/context/graph-branch-intent";
import { useHistoryMode } from "@/components/context/history-mode";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useLinkEditor } from "@/components/context/link-editor";
import { useModelConfig } from "@/components/context/model-config";
import { useNodyPanel } from "@/components/context/nody-panel";
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
import { formatBytes, getContextBudgetPolicy } from "@/lib/context-budget";
import {
  type SessionArtifact,
  toLlmContextArtifacts,
} from "@/lib/session-artifacts";

const nodeTypes: NodeTypes = {
  artifactNode: ArtifactGraphNode,
  threadNode: ThreadGraphNode,
};

const edgeTypes: EdgeTypes = {
  threadEdge: ThreadGraphEdge,
};

const providerDisplay = (provider?: string | null) => {
  if (!provider) return undefined;
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "ollama") return "Ollama";
  return provider;
};

const scrollMessageIntoView = (messageId: string) => {
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
};

const artifactAccent = (artifactType: SessionArtifact["artifactType"]) => {
  switch (artifactType) {
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

const artifactTypeLabel = (artifactType: SessionArtifact["artifactType"]) => {
  switch (artifactType) {
    case "code":
      return "Code Context";
    case "image":
      return "Image Context";
    case "file":
      return "File Context";
    default:
      return "Text Context";
  }
};

const artifactDefaultTitle = (
  artifactType: SessionArtifact["artifactType"],
  existingArtifacts: SessionArtifact[],
) => {
  const count = existingArtifacts.filter((artifact) => artifact.artifactType === artifactType).length + 1;
  switch (artifactType) {
    case "code":
      return `Code Context ${count}`;
    case "image":
      return `Image Context ${count}`;
    case "file":
      return `File Context ${count}`;
    default:
      return `Text Context ${count}`;
  }
};

const artifactContentLabel = (artifactType: SessionArtifact["artifactType"]) => {
  switch (artifactType) {
    case "image":
      return "Notes";
    case "file":
      return "Extracted text / notes";
    default:
      return "Content";
  }
};

const artifactContentPlaceholder = (artifactType: SessionArtifact["artifactType"]) => {
  switch (artifactType) {
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

type FlowSpotlightMode = "all" | "assistant" | "user" | "bridge" | "edited";
type FlowDensityMode = "overview" | "focus";

const flowFilterLabel: Record<FlowSpotlightMode, string> = {
  all: "All",
  assistant: "Assistant",
  user: "User",
  bridge: "Bridge",
  edited: "Edited",
};

const isFlowViewport = (value: Viewport | null): value is Viewport =>
  !!value &&
  typeof value.x === "number" &&
  typeof value.y === "number" &&
  typeof value.zoom === "number";

export function ThreadGraphFlow() {
  const runtime = useAssistantRuntime();
  const { historyMode } = useHistoryMode();
  const { llmEnabled } = useLlmEnabled();
  const { modelId, provider } = useModelConfig();
  const { publishSnapshot } = useNodyPanel();
  const { clearRequestError, setRequestError } = useRequestError();
  const { activeSession, activeSessionId } = usePersistedSessions();
  const { focusedMessageId, setFocusedMessageId, setViewMode } = useSessionUiState();
  const {
    artifacts,
    contextLinks,
    createArtifact,
    deleteArtifact,
    getArtifactsForTarget,
    isArtifactLinkedToTarget,
    linkArtifactToTarget,
    unlinkArtifactFromTarget,
    updateArtifact,
  } = useSessionArtifacts();
  const {
    items: repoItems,
    order: itemOrderMap,
    bridges: bridgeNodeIds,
  } = useThreadRepoItems(runtime, { defaultModel: { modelId, provider } });
  const { cutLink, getParentId, overrides, resetLinks, restoreLink } = useLinkEditor();
  const { beginDraft, cancelDraft, draft, setDraftText } = useGraphBranchIntent();
  const [linkEditMode, setLinkEditMode] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState<FlowSpotlightMode>("all");
  const [densityMode, setDensityMode] = React.useState<FlowDensityMode>("overview");
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<
    ReactFlowInstance<ThreadGraphFlowNode, ThreadGraphFlowEdge> | null
  >(null);
  const contextBudgetPolicy = React.useMemo(
    () => getContextBudgetPolicy({ modelId, provider }),
    [modelId, provider],
  );
  const imageUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const flowViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [storedViewport, setStoredViewport] = React.useState<Viewport | null>(() =>
    readFlowViewport(activeSessionId),
  );
  const treeSignatureRef = React.useRef<string | null>(null);

  const nodes = React.useMemo(
    () => buildThreadGraphNodes({ repoItems, bridgeNodeIds, getParentId }),
    [repoItems, bridgeNodeIds, getParentId],
  );
  const nodeIndex = React.useMemo(() => new Map(nodes.map((node) => [node.id, node] as const)), [nodes]);
  const artifactIndex = React.useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact] as const)),
    [artifacts],
  );
  const linkedTargetCountByArtifact = React.useMemo(() => {
    const counts = new Map<string, number>();
    contextLinks.forEach((link) => {
      counts.set(link.artifactId, (counts.get(link.artifactId) ?? 0) + 1);
    });
    return counts;
  }, [contextLinks]);

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
    setLinkEditMode(false);
    setSpotlight("all");
    setDensityMode("overview");
    treeSignatureRef.current = null;
    cancelDraft();
  }, [activeSessionId, cancelDraft]);

  React.useEffect(() => {
    if (draft && selectedNodeId && draft.anchorId !== selectedNodeId) {
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
      all: nodes.length + artifacts.length,
      assistant: 0,
      user: 0,
      bridge: 0,
      edited: 0,
    };
    nodes.forEach((node) => {
      if (node.role === "assistant") counts.assistant += 1;
      if (node.role === "user") counts.user += 1;
      if (node.isBridge) counts.bridge += 1;
      if (node.editedFromId) counts.edited += 1;
    });
    return counts;
  }, [artifacts.length, nodes]);

  const matchesSpotlight = React.useCallback(
    (node: (typeof nodes)[number]) => {
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
      nodes.forEach((node) => {
        if (node.parentId === current && !lineage.has(node.id)) {
          lineage.add(node.id);
          queue.push(node.id);
        }
      });
    }

    return lineage;
  }, [nodeIndex, nodes, selectedArtifact, selectedNodeId]);

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

    nodes.forEach((node) => {
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
    nodes,
    selectedArtifact,
    selectedContextArtifactIds,
    selectedContextLinkedMessageIds,
    selectedNodeId,
  ]);

  const applyCanvasSelection = React.useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (!nodeId || nodeId === "__ROOT__") {
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
    [artifactIndex, nodeIndex, setFocusedMessageId],
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
    if (densityMode === "focus" && !selectedNodeId) {
      setDensityMode("overview");
    }
  }, [densityMode, selectedNodeId]);

  const relatedContextIds = React.useMemo(() => {
    const related = new Set<string>();
    selectedContextArtifactIds.forEach((id) => related.add(id));
    selectedContextLinkedMessageIds.forEach((id) => related.add(id));
    return related;
  }, [selectedContextArtifactIds, selectedContextLinkedMessageIds]);

  const baseConversationNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    return nodes.map((node) => {
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
          isRoot: node.id === "__ROOT__",
          kind: node.id === "__ROOT__" ? "root" : node.isBridge ? "bridge" : "message",
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
  }, [getArtifactsForTarget, nodes, overrides]);

  const baseArtifactNodes = React.useMemo<ThreadGraphFlowNode[]>(() => {
    return artifacts.map((artifact) => ({
      id: artifact.id,
      type: "artifactNode",
      position: artifact.position ?? { x: 0, y: 0 },
      selectable: true,
      draggable: true,
      data: {
        accent: artifactAccent(artifact.artifactType),
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
        role: "artifact",
        sourceDataUrl: artifact.sourceDataUrl ?? null,
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
    return nodes
      .filter((node) => node.parentId !== null)
      .map((node) => {
        const parentNode = node.parentId ? nodeIndex.get(node.parentId) ?? null : null;
        const isEditable = parentNode ? parentNode.id !== "__ROOT__" && nodesShareBranch(parentNode, node) : false;
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
  }, [handleCutEdge, linkEditMode, nodeIndex, nodes]);

  const baseContextEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    return contextLinks.flatMap((link) => {
      const artifact = artifactIndex.get(link.artifactId);
      const targetNode = nodeIndex.get(link.targetMessageId);
      if (!artifact || !targetNode) return [];
      const accent = artifactAccent(artifact.artifactType);
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

  const { nodes: flowNodes, edges: flowEdges } = React.useMemo(
    () =>
      layoutThreadGraphFlow(
        [...baseConversationNodes, ...baseArtifactNodes],
        [...baseConversationEdges, ...baseContextEdges],
      ),
    [baseArtifactNodes, baseContextEdges, baseConversationEdges, baseConversationNodes],
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
        nodes.map((node) => `${node.id}:${String(node.branchId ?? "")}`).join("|"),
        baseConversationEdges.map((edge) => `${edge.source}->${edge.target}`).join("|"),
      ].join("::"),
    [baseConversationEdges, nodes],
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

  const selectedFlowNode = React.useMemo(
    () => decoratedFlowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [decoratedFlowNodes, selectedNodeId],
  );
  const selectedBranchSpec = React.useMemo(() => {
    if (!selectedMessageNode || !draft || draft.anchorId !== selectedMessageNode.id) return null;
    return buildBranchSpec(selectedMessageNode, draft.operation);
  }, [draft, selectedMessageNode]);
  const selectedBranchOptions = React.useMemo(() => {
    if (!selectedMessageNode) return [];
    return getAllowedBranchOperations(selectedMessageNode).map(getBranchOperationDetail);
  }, [selectedMessageNode]);
  const isThreadRunning = runtime.threads.main.getState().isRunning;

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
    if (!selectedMessageNode || selectedMessageNode.id === "__ROOT__") return;
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
      beginDraft(selectedMessageNode.id, operation);
    },
    [beginDraft, selectedMessageNode],
  );

  const handleSubmitBranchDraft = React.useCallback(() => {
    if (!selectedBranchSpec || !draft || !llmEnabled || isThreadRunning) return;

    try {
      setIsSubmittingBranch(true);
      clearRequestError();
      const executed = executeBranchSpec(runtime.threads.main, selectedBranchSpec, {
        contextArtifacts:
          selectedContextArtifacts.length > 0 ? toLlmContextArtifacts(selectedContextArtifacts) : undefined,
        contextNodeIds:
          selectedContextArtifacts.length > 0
            ? selectedContextArtifacts.map((artifact) => artifact.id)
            : undefined,
        historyMode,
        modelId,
        provider,
        text: draft.text,
      });
      if (!executed) {
        setRequestError("Branch draft is empty. Add a prompt before creating the branch.");
        return;
      }
      cancelDraft();
    } catch {
      setRequestError("Canvas branching failed. Try again from the selected node.");
    } finally {
      setIsSubmittingBranch(false);
    }
  }, [
    cancelDraft,
    clearRequestError,
    draft,
    historyMode,
    isThreadRunning,
    llmEnabled,
    modelId,
    provider,
    runtime,
    selectedBranchSpec,
    selectedContextArtifacts,
    setRequestError,
  ]);

  const handleCreateArtifact = React.useCallback(
    (artifactType: SessionArtifact["artifactType"]) => {
      const created = createArtifact({
        artifactType,
        title: artifactDefaultTitle(artifactType, artifacts),
        content: "",
        language: artifactType === "code" ? "ts" : null,
      });
      setSelectedNodeId(created.id);
      setFocusedMessageId(null);
    },
    [artifacts, createArtifact, setFocusedMessageId],
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
        const created = createArtifact({
          artifactType,
          blobRef: uploadData.blobRef ?? null,
          byteSize: uploadData.byteSize ?? file.size,
          content,
          fileName: uploadData.fileName ?? file.name,
          mimeType: uploadData.mimeType ?? (file.type || null),
          sourceDataUrl,
          title,
        });
        setSelectedNodeId(created.id);
        setFocusedMessageId(null);
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
      contextBudgetPolicy,
      createArtifact,
      setFocusedMessageId,
      setRequestError,
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

  const selectedPreview = selectedFlowNode?.data.preview?.replace(/\s+/g, " ").trim() ?? "";
  const visibleCanvasNodeCount = decoratedFlowNodes.length;
  const hiddenCanvasNodeCount = Math.max(0, flowNodes.length - visibleCanvasNodeCount);
  const selectedArtifactSize = formatByteSize(selectedArtifact?.byteSize);
  const selectedArtifactPreviewSize = selectedArtifact?.sourceDataUrl
    ? formatByteSize(estimateDataUrlBytes(selectedArtifact.sourceDataUrl))
    : null;
  const selectedArtifactHeadline = React.useMemo(
    () => (selectedArtifact ? getArtifactHeadline(selectedArtifact) : ""),
    [selectedArtifact],
  );
  const selectedArtifactHighlights = React.useMemo(
    () => (selectedArtifact ? getArtifactHighlights(selectedArtifact, 4) : []),
    [selectedArtifact],
  );
  const selectedArtifactCodeSample = React.useMemo(
    () => (selectedArtifact ? getArtifactCodeSample(selectedArtifact, 8) : []),
    [selectedArtifact],
  );
  const selectedArtifactStatChips = React.useMemo(
    () => (selectedArtifact ? getArtifactStatChips(selectedArtifact) : []),
    [selectedArtifact],
  );
  const selectedArtifactLineCount = React.useMemo(
    () => (selectedArtifact ? getArtifactLineCount(selectedArtifact) : 0),
    [selectedArtifact],
  );
  const attachableTargets = React.useMemo(
    () =>
      nodes.filter((node) => !node.isBridge).map((node) => ({
        id: node.id,
        preview: node.text.replace(/\s+/g, " ").trim() || (node.id === "__ROOT__" ? "Conversation root" : "No preview"),
        role: node.id === "__ROOT__" ? "root" : node.role,
      })),
    [nodes],
  );
  const canvasGuideNodes = React.useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        branchId:
          typeof node.branchId === "string" || typeof node.branchId === "number"
            ? node.branchId
            : null,
      })),
    [nodes],
  );
  const canvasGuideEdges = React.useMemo(
    () =>
      decoratedFlowEdges.map((edge) => ({
        id: edge.id,
        label: edge.data?.label ?? null,
        source: edge.source,
        target: edge.target,
        tone: edge.data?.tone ?? "default",
      })),
    [decoratedFlowEdges],
  );
  React.useEffect(() => {
    publishSnapshot({
      artifacts,
      contextLinks,
      edges: canvasGuideEdges,
      historyMode,
      llmEnabled,
      modelId,
      nodes: canvasGuideNodes,
      provider,
      selectedEdgeId: null,
      selectedNodeId,
      sessionId: activeSessionId,
      sessionTitle: activeSession?.title ?? null,
    });
  }, [
    activeSession?.title,
    activeSessionId,
    artifacts,
    canvasGuideEdges,
    canvasGuideNodes,
    contextLinks,
    historyMode,
    llmEnabled,
    modelId,
    provider,
    publishSnapshot,
    selectedNodeId,
  ]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.08),transparent_30%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.98))]">
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUploadChange}
      />
      <input
        ref={fileUploadInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUploadChange}
      />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Canvas</h2>
          <p className="text-xs text-muted-foreground">
            Conversation branches and reusable context live in one surface. Use filters for overview, then switch to focus mode when you want a cleaner path.
          </p>
          {linkEditMode ? (
            <p className="text-xs text-rose-700">
              Link edit mode is on. Use the floating <span className="font-semibold">Cut link</span> controls on edges, then restore a disconnected node from the detail panel.
            </p>
          ) : null}
          {legendItems.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {legendItems.map((item) => (
                <LegendItem key={item.key} color={item.swatch} label={item.label} />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(flowFilterLabel) as FlowSpotlightMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  spotlight === mode
                    ? "border-sky-500/35 bg-sky-500/10 text-sky-700"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:bg-background"
                }`}
                onClick={() => setSpotlight(mode)}
              >
                <span>{flowFilterLabel[mode]}</span>
                <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px]">
                  {filterCounts[mode]}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={!selectedNodeId}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                densityMode === "focus"
                  ? "border-violet-500/35 bg-violet-500/10 text-violet-700"
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
        </div>
        <div className="flex max-w-[460px] flex-1 flex-col items-stretch gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
              {visibleCanvasNodeCount} / {flowNodes.length} nodes
            </span>
            {hiddenCanvasNodeCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
                {hiddenCanvasNodeCount} hidden
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-700">
              {artifacts.length} artifact{artifacts.length === 1 ? "" : "s"}
            </span>
            {overrides.size > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700">
                {overrides.size} cut links
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-700 transition-colors hover:bg-violet-500/15"
              onClick={() => handleCreateArtifact("text")}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>New Text</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-500/15"
              onClick={() => handleCreateArtifact("code")}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>New Code</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-pink-500/30 bg-pink-500/10 px-2.5 py-1.5 text-xs text-pink-700 transition-colors hover:bg-pink-500/15"
              onClick={() => imageUploadInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              <span>Upload Image</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs text-blue-700 transition-colors hover:bg-blue-500/15"
              onClick={() => fileUploadInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                linkEditMode
                  ? "border-rose-500/35 bg-rose-500/10 text-rose-700"
                  : "border-border/60 bg-background/90 hover:bg-background"
              }`}
              onClick={() => setLinkEditMode((prev) => !prev)}
            >
              <Scissors className="h-3.5 w-3.5" />
              <span>{linkEditMode ? "Finish Editing" : "Edit Links"}</span>
            </button>
            {overrides.size > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2.5 py-1.5 text-xs hover:bg-background"
                onClick={resetLinks}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Cuts ({overrides.size})</span>
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-700 transition-colors hover:bg-sky-500/15"
              onClick={() => setViewMode("nody")}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Open Nody</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2.5 py-1.5 text-xs hover:bg-background"
              onClick={handleCopyJson}
            >
              <CopyIcon className="h-3.5 w-3.5" />
              <span>Copy JSON</span>
            </button>
          </div>
          <p className="text-right text-[11px] text-muted-foreground">
            Upload caps: images {formatBytes(contextBudgetPolicy.maxUploadImageBytes)}, files {formatBytes(contextBudgetPolicy.maxUploadFileBytes)}. Image previews are compressed under {formatBytes(contextBudgetPolicy.maxImagePreviewBytes)}.
          </p>
          <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-border/60 bg-background/85 px-3 py-2 shadow-sm">
            {selectedArtifact ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{
                          borderColor: `${artifactAccent(selectedArtifact.artifactType)}55`,
                          color: artifactAccent(selectedArtifact.artifactType),
                        }}
                      >
                        {artifactTypeLabel(selectedArtifact.artifactType)}
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
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Artifact nodes live outside the chat tree and can be reused as context for multiple branches.
                    </p>
                  </div>
                  <Sparkles className="h-4 w-4 text-violet-600" />
                </div>
                <div className="grid gap-2 md:grid-cols-[1.4fr,0.8fr]">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">Title</span>
                    <input
                      type="text"
                      value={selectedArtifact.title}
                      onChange={(event) => updateArtifact(selectedArtifact.id, { title: event.target.value })}
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                    />
                  </label>
                  {selectedArtifact.artifactType === "code" ? (
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">Language</span>
                      <input
                        type="text"
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
                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{
                        borderColor: `${artifactAccent(selectedArtifact.artifactType)}55`,
                        color: artifactAccent(selectedArtifact.artifactType),
                      }}
                    >
                      {getArtifactReadableRole(selectedArtifact.artifactType)}
                    </span>
                    {selectedArtifactStatChips.slice(0, 3).map((chip) => (
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
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Tool-ready card
                    </p>
                    <p className="text-sm font-semibold text-foreground/90">{selectedArtifactHeadline}</p>
                    <p className="text-xs text-muted-foreground">
                      {getArtifactIntentLabel(selectedArtifact.artifactType)}
                    </p>
                  </div>
                  {selectedArtifact.artifactType === "code" ? (
                    <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-slate-950 px-3 py-2 text-[12px] text-emerald-100">
                      {selectedArtifactCodeSample.length > 0 ? (
                        selectedArtifactCodeSample.map((line, index) => (
                          <div key={`${index}:${line}`} className="grid grid-cols-[auto,1fr] gap-3 leading-5">
                            <span className="select-none text-emerald-300/45">{index + 1}</span>
                            <code className="truncate font-mono">{line}</code>
                          </div>
                        ))
                      ) : (
                        <p className="font-mono text-emerald-100/80">No code captured yet.</p>
                      )}
                    </div>
                  ) : selectedArtifactHighlights.length > 0 ? (
                    <div className="space-y-1.5">
                      {selectedArtifactHighlights.map((line) => (
                        <div key={line} className="flex items-start gap-2 text-xs leading-5 text-foreground/84">
                          <span
                            className="mt-1 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: artifactAccent(selectedArtifact.artifactType) }}
                          />
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
                      ? "Structured notes"
                      : artifactContentLabel(selectedArtifact.artifactType)}
                  </span>
                  <textarea
                    rows={6}
                    value={selectedArtifact.content}
                    onChange={(event) => updateArtifact(selectedArtifact.id, { content: event.target.value })}
                    placeholder={artifactContentPlaceholder(selectedArtifact.artifactType)}
                    className="min-h-[136px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
                  />
                </label>
                <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/80">Attach to conversation nodes</p>
                    <p className="text-xs text-muted-foreground">
                      Link this artifact to any branch anchor, then jump there to create a contextual branch.
                    </p>
                  </div>
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
                              <span>Open target</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Drag this node in the canvas to reposition it. Linked targets stay attached.
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-500/15"
                    onClick={() => {
                      deleteArtifact(selectedArtifact.id);
                      applyCanvasSelection(null);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete artifact</span>
                  </button>
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
                <div className="flex flex-wrap items-center gap-2">
                  {selectedNodeId !== "__ROOT__" ? (
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
                                    borderColor: `${artifactAccent(artifact.artifactType)}44`,
                                    color: artifactAccent(artifact.artifactType),
                                  }}
                                >
                                  {artifactTypeLabel(artifact.artifactType)}
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
                <GraphBranchActions
                  activeDraft={
                    draft && draft.anchorId === selectedMessageNode.id
                      ? { operation: draft.operation, text: draft.text }
                      : null
                  }
                  busy={isSubmittingBranch}
                  contextCount={selectedContextArtifacts.length}
                  disabled={!llmEnabled || isThreadRunning}
                  details={selectedBranchOptions}
                  onCancelDraft={cancelDraft}
                  onChooseOperation={handleChooseBranchOperation}
                  onDraftTextChange={setDraftText}
                  onSubmitDraft={handleSubmitBranchDraft}
                />
              </div>
            ) : (
              <div className="space-y-1 text-right">
                <p className="text-xs font-medium text-foreground/80">No node selected</p>
                <p className="text-xs text-muted-foreground">
                  Click a message node to branch or attach context. Click an artifact node to edit reusable context.
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div ref={flowViewportRef} className="relative min-h-0 flex-1">
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
          onMoveEnd={(_, viewport) => {
            setStoredViewport(viewport);
          }}
          onNodeDragStop={(_, node) => {
            if (node.data?.kind !== "artifact") return;
            updateArtifact(node.id, {
              position: {
                x: node.position.x,
                y: node.position.y,
              },
            });
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
            if (node.data.kind === "artifact" || node.id === "__ROOT__") return;
            applyCanvasSelection(node.id);
            setViewMode("split");
            scrollMessageIntoView(node.id);
          }}
          onPaneClick={() => applyCanvasSelection(null)}
          className="bg-transparent"
          defaultEdgeOptions={{
            animated: false,
          }}
        >
          <Background color="rgba(148,163,184,0.3)" gap={20} size={1.2} />
          <MiniMap
            pannable
            zoomable
            className="!pointer-events-none !bottom-4 !right-4 !rounded-2xl !border !border-border/70 !bg-background/90 !shadow-lg"
            nodeColor={(node) =>
              String(
                (node.data as { accent?: string } | undefined)?.accent ?? "rgba(100,116,139,0.85)",
              )
            }
            maskColor="rgba(15,23,42,0.08)"
          />
          <Controls
            className="!bottom-auto !left-auto !right-4 !top-4 [&>button]:!border-border/70 [&>button]:!bg-background/90 [&>button]:!text-foreground"
            showInteractive={false}
          />
        </ReactFlow>
      </div>
    </section>
  );
}
