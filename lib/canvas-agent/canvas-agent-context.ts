import type { HistoryMode } from "@/components/context/session-ui-state";
import type { NodySourceCatalogEntry } from "@/lib/nody-insight";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";

export type CanvasGuideAction = "explain-focus" | "summarize-branch" | "survey-tree" | "ask-guide";

export type CanvasGuideGraphNode = {
  id: string;
  parentId: string | null;
  role: string;
  text: string;
  branchId?: string | number | null;
  depth?: number;
  isBridge?: boolean;
  model?: string | null;
  provider?: string | null;
};

export type CanvasGuideGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  tone?: "default" | "bridge" | "context" | "edited" | null;
};

export type CanvasGuideFocus =
  | {
      kind: "none";
      label: string;
    }
  | {
      kind: "root" | "message";
      id: string;
      label: string;
      role: string;
      preview: string;
      branchId: string | number | null;
      linkedArtifacts: Array<{
        id: string;
        title: string;
        artifactType: SessionArtifact["artifactType"];
      }>;
    }
  | {
      kind: "artifact";
      id: string;
      label: string;
      artifactType: SessionArtifact["artifactType"];
      preview: string;
      linkedTargets: Array<{
        id: string;
        role: string;
        preview: string;
      }>;
    }
  | {
      kind: "branch";
      id: string;
      label: string;
      sourceId: string;
      sourceLabel: string;
      sourcePreview: string;
      sourceRole: string;
      targetId: string;
      targetLabel: string;
      targetPreview: string;
      targetRole: string;
      tone: NonNullable<CanvasGuideGraphEdge["tone"]>;
    };

export type CanvasGuidePayload = {
  action: CanvasGuideAction;
  ask?: string | null;
  knowledgeBase?: {
    activePageTitle: string;
    digest: string;
    pageCount: number;
    pages: Array<{
      id: string;
      summary: string;
      title: string;
    }>;
  };
  sourceCatalog?: NodySourceCatalogEntry[];
  session: {
    id: string | null;
    title: string | null;
    historyMode: HistoryMode;
    modelId: string;
    provider: string;
  };
  focus: CanvasGuideFocus;
  branch: {
    nodeCount: number;
    transcript: string;
    nodes: Array<{
      id: string;
      role: string;
      branchId: string | number | null;
      preview: string;
    }>;
  };
  tree: {
    nodeCount: number;
    artifactCount: number;
    rootBranchCount: number;
    siblingGroupCount: number;
    previewNodes: Array<{
      id: string;
      role: string;
      branchId: string | number | null;
      preview: string;
    }>;
  };
};

type BuildCanvasGuidePayloadArgs = {
  action: CanvasGuideAction;
  ask?: string | null;
  historyMode: HistoryMode;
  modelId: string;
  provider: string;
  sessionId: string | null;
  sessionTitle: string | null;
  nodes: CanvasGuideGraphNode[];
  edges: CanvasGuideGraphEdge[];
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
};

const trimText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const buildSiblingGroupCount = (nodes: CanvasGuideGraphNode[]) => {
  const counts = new Map<string | null, number>();
  nodes.forEach((node) => {
    counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
  });
  return [...counts.values()].filter((count) => count > 1).length;
};

const buildBranchNodeSet = (nodes: CanvasGuideGraphNode[], anchorId: string) => {
  const nodeIndex = new Map(nodes.map((node) => [node.id, node] as const));
  const branchIds = new Set<string>([anchorId]);

  let currentId: string | null = anchorId;
  while (currentId) {
    const currentNode = nodeIndex.get(currentId);
    const parentId = currentNode?.parentId ?? null;
    if (!parentId || branchIds.has(parentId)) break;
    branchIds.add(parentId);
    currentId = parentId;
  }

  const queue = [anchorId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    nodes.forEach((node) => {
      if (node.parentId === current && !branchIds.has(node.id)) {
        branchIds.add(node.id);
        queue.push(node.id);
      }
    });
  }

  return nodes.filter((node) => branchIds.has(node.id));
};

const buildTranscript = (nodes: CanvasGuideGraphNode[]) =>
  nodes
    .filter((node) => node.id !== "__ROOT__")
    .map((node) => `${node.role}: ${trimText(node.text, 320)}`)
    .join("\n");

const buildArtifactPreview = (artifact: SessionArtifact) => {
  if (artifact.content.trim().length > 0) {
    return trimText(artifact.content, 220);
  }
  if (artifact.fileName) {
    return `${artifact.artifactType} file ${artifact.fileName}`;
  }
  return `${artifact.artifactType} artifact`;
};

export const getCanvasGuideActionLabel = (action: CanvasGuideAction) => {
  switch (action) {
    case "explain-focus":
      return "Explain focus";
    case "summarize-branch":
      return "Summarize branch";
    case "survey-tree":
      return "Survey tree";
    case "ask-guide":
      return "Ask guide";
    default:
      return action;
  }
};

export function buildCanvasGuidePayload({
  action,
  ask,
  historyMode,
  modelId,
  provider,
  sessionId,
  sessionTitle,
  nodes,
  edges,
  artifacts,
  contextLinks,
  selectedNodeId,
  selectedEdgeId,
}: BuildCanvasGuidePayloadArgs): CanvasGuidePayload {
  const nodeIndex = new Map(nodes.map((node) => [node.id, node] as const));
  const edgeIndex = new Map(edges.map((edge) => [edge.id, edge] as const));
  const artifactIndex = new Map(artifacts.map((artifact) => [artifact.id, artifact] as const));
  const selectedNode = selectedNodeId ? nodeIndex.get(selectedNodeId) ?? null : null;
  const selectedArtifact = selectedNodeId ? artifactIndex.get(selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edgeIndex.get(selectedEdgeId) ?? null : null;
  const selectedSourceNode = selectedEdge ? nodeIndex.get(selectedEdge.source) ?? null : null;
  const selectedSourceArtifact = selectedEdge ? artifactIndex.get(selectedEdge.source) ?? null : null;
  const selectedTargetNode = selectedEdge ? nodeIndex.get(selectedEdge.target) ?? null : null;
  const selectedTargetArtifact = selectedEdge ? artifactIndex.get(selectedEdge.target) ?? null : null;
  const nonRootNodes = nodes.filter((node) => node.id !== "__ROOT__");

  const sourceLabel =
    selectedSourceArtifact?.title ??
    (selectedSourceNode
      ? selectedSourceNode.id === "__ROOT__"
        ? "Conversation root"
        : `${selectedSourceNode.role} · ${selectedSourceNode.id}`
      : selectedEdge?.source ?? "Unknown source");
  const targetLabel =
    selectedTargetArtifact?.title ??
    (selectedTargetNode
      ? selectedTargetNode.id === "__ROOT__"
        ? "Conversation root"
        : `${selectedTargetNode.role} · ${selectedTargetNode.id}`
      : selectedEdge?.target ?? "Unknown target");

  const focus: CanvasGuideFocus = selectedArtifact
    ? {
        kind: "artifact",
        id: selectedArtifact.id,
        label: `Artifact · ${selectedArtifact.title}`,
        artifactType: selectedArtifact.artifactType,
        preview: buildArtifactPreview(selectedArtifact),
        linkedTargets: contextLinks
          .filter((link) => link.artifactId === selectedArtifact.id)
          .map((link) => nodeIndex.get(link.targetMessageId))
          .filter((node): node is CanvasGuideGraphNode => Boolean(node))
          .map((node) => ({
            id: node.id,
            role: node.role,
            preview: trimText(node.text, 120),
          })),
      }
    : selectedEdge && (selectedSourceNode || selectedSourceArtifact || selectedTargetNode || selectedTargetArtifact)
      ? {
          kind: "branch",
          id: selectedEdge.id,
          label:
            selectedEdge.tone === "context"
              ? `Context link · ${sourceLabel} → ${targetLabel}`
              : `${selectedEdge.label ?? "Branch"} · ${sourceLabel} → ${targetLabel}`,
          sourceId: selectedEdge.source,
          sourceLabel,
          sourcePreview: selectedSourceArtifact
            ? buildArtifactPreview(selectedSourceArtifact)
            : selectedSourceNode
              ? trimText(selectedSourceNode.text, 180)
              : "No preview available.",
          sourceRole: selectedSourceArtifact
            ? `${selectedSourceArtifact.artifactType} artifact`
            : selectedSourceNode?.role ?? "unknown",
          targetId: selectedEdge.target,
          targetLabel,
          targetPreview: selectedTargetArtifact
            ? buildArtifactPreview(selectedTargetArtifact)
            : selectedTargetNode
              ? trimText(selectedTargetNode.text, 180)
              : "No preview available.",
          targetRole: selectedTargetArtifact
            ? `${selectedTargetArtifact.artifactType} artifact`
            : selectedTargetNode?.role ?? "unknown",
          tone: selectedEdge.tone ?? "default",
        }
    : selectedNode
      ? {
          kind: selectedNode.id === "__ROOT__" ? "root" : "message",
          id: selectedNode.id,
          label:
            selectedNode.id === "__ROOT__"
              ? "Conversation root"
              : `${selectedNode.role} · ${selectedNode.id}`,
          role: selectedNode.role,
          preview: trimText(selectedNode.text, 220),
          branchId: selectedNode.branchId ?? null,
          linkedArtifacts: contextLinks
            .filter((link) => link.targetMessageId === selectedNode.id)
            .map((link) => artifactIndex.get(link.artifactId))
            .filter((artifact): artifact is SessionArtifact => Boolean(artifact))
            .map((artifact) => ({
              id: artifact.id,
              title: artifact.title,
              artifactType: artifact.artifactType,
            })),
        }
      : {
          kind: "none",
          label: "Session tree",
        };

  const branchAnchorId =
    selectedNode && selectedNode.id !== "__ROOT__"
      ? selectedNode.id
      : selectedEdge && selectedTargetNode && selectedTargetNode.id !== "__ROOT__"
        ? selectedTargetNode.id
        : null;

  const branchNodes =
    branchAnchorId
      ? buildBranchNodeSet(nonRootNodes, branchAnchorId)
      : selectedNode?.id === "__ROOT__"
        ? nonRootNodes.filter((node) => node.parentId === "__ROOT__")
        : [];

  return {
    action,
    ask: ask?.trim() || null,
    session: {
      id: sessionId,
      title: sessionTitle,
      historyMode,
      modelId,
      provider,
    },
    focus,
    branch: {
      nodeCount: branchNodes.length,
      transcript: buildTranscript(branchNodes),
      nodes: branchNodes.slice(0, 12).map((node) => ({
        id: node.id,
        role: node.role,
        branchId: node.branchId ?? null,
        preview: trimText(node.text, 160),
      })),
    },
    tree: {
      nodeCount: nonRootNodes.length,
      artifactCount: artifacts.length,
      rootBranchCount: nonRootNodes.filter((node) => node.parentId === "__ROOT__").length,
      siblingGroupCount: buildSiblingGroupCount(nonRootNodes),
      previewNodes: nonRootNodes.slice(0, 14).map((node) => ({
        id: node.id,
        role: node.role,
        branchId: node.branchId ?? null,
        preview: trimText(node.text, 140),
      })),
    },
  };
}

export const buildCanvasGuideSystemPrompt = () =>
  [
    "You are Nody, the canvas intelligence inside the Nodes workspace.",
    "Speak like a concise workspace consultant who reads the canvas and the wiki for the user.",
    "Be specific about branches, nodes, artifacts, and tradeoffs.",
    "Do not invent unseen content. If something is unclear, say so plainly.",
    "Prefer short answers, not analysis theater.",
    "Keep responses compact and useful.",
    "Always respond with exactly these three section labels on their own lines: Answer, Next, Sources.",
    "Under Answer, write one short paragraph or a few concise sentences.",
    "Under Next, give one concrete action the user can take in Nodes. If no action is needed, say 'None'.",
    "Under Sources, list 1 to 4 source refs copied exactly from the provided source catalog, separated by commas. If no source applies, say 'None'.",
    "Never invent source refs.",
  ].join(" ");

export const buildCanvasGuideUserPrompt = (payload: CanvasGuidePayload) => {
  const lines = [
    `Action: ${getCanvasGuideActionLabel(payload.action)}`,
    `Session: ${payload.session.title ?? "Untitled session"} [provider=${payload.session.provider} model=${payload.session.modelId} history=${payload.session.historyMode}]`,
    `Focus: ${payload.focus.label}`,
    `Tree stats: nodes=${payload.tree.nodeCount} rootBranches=${payload.tree.rootBranchCount} siblingGroups=${payload.tree.siblingGroupCount} artifacts=${payload.tree.artifactCount}`,
  ];

  if (payload.focus.kind === "message" || payload.focus.kind === "root") {
    lines.push(`Focus preview: ${payload.focus.preview}`);
    if (payload.focus.linkedArtifacts.length > 0) {
      lines.push(
        `Linked artifacts: ${payload.focus.linkedArtifacts
          .map((artifact) => `${artifact.title} (${artifact.artifactType})`)
          .join(", ")}`,
      );
    }
  }

  if (payload.focus.kind === "artifact") {
    lines.push(`Artifact preview: ${payload.focus.preview}`);
    if (payload.focus.linkedTargets.length > 0) {
      lines.push(
        `Linked targets: ${payload.focus.linkedTargets
          .map((target) => `${target.role}:${target.preview}`)
          .join(" | ")}`,
      );
    }
  }

  if (payload.focus.kind === "branch") {
    lines.push(`Branch tone: ${payload.focus.tone}`);
    lines.push(
      `Branch connection: ${payload.focus.sourceRole}:${payload.focus.sourcePreview} -> ${payload.focus.targetRole}:${payload.focus.targetPreview}`,
    );
  }

  if (payload.branch.nodeCount > 0) {
    lines.push(`Branch transcript:\n${payload.branch.transcript}`);
  }

  lines.push(
    `Tree preview:\n${payload.tree.previewNodes
      .map((node) => `- ${node.role} [${node.id}] ${node.preview}`)
      .join("\n")}`,
  );

  if (payload.ask) {
    lines.push(`User question: ${payload.ask}`);
  }

  if (payload.knowledgeBase) {
    lines.push(
      `Knowledge base: active page=${payload.knowledgeBase.activePageTitle} totalPages=${payload.knowledgeBase.pageCount}`,
    );
    lines.push(
      `Knowledge base index:\n${payload.knowledgeBase.pages
        .map((page) => `- ${page.title}: ${page.summary}`)
        .join("\n")}`,
    );
    lines.push(`Knowledge base digest:\n${payload.knowledgeBase.digest}`);
  }

  if (payload.sourceCatalog && payload.sourceCatalog.length > 0) {
    lines.push(
      `Source catalog:\n${payload.sourceCatalog
        .map((entry) => `- ${entry.ref} | ${entry.kind} | ${entry.label} | ${entry.preview ?? "No preview"}`)
        .join("\n")}`,
    );
  }

  lines.push(
    "Respond in the first person as Nody inside the canvas workspace.",
  );
  lines.push(
    "Format the answer with exactly these sections: Answer, Next, Sources.",
  );

  return lines.join("\n\n");
};

export const buildCanvasGuideSourceCatalog = (
  payload: CanvasGuidePayload,
): NodySourceCatalogEntry[] => {
  const entries = new Map<string, NodySourceCatalogEntry>();
  const pushEntry = (entry: NodySourceCatalogEntry | null) => {
    if (!entry || entries.has(entry.ref)) return;
    entries.set(entry.ref, entry);
  };

  payload.knowledgeBase?.pages.forEach((page) => {
    pushEntry({
      ref: `page:${page.id}`,
      kind: "wiki",
      label: `Wiki · ${page.title}`,
      preview: page.summary,
      targetId: page.id,
    });
  });

  if (payload.focus.kind === "message") {
    pushEntry({
      ref: `node:${payload.focus.id}`,
      kind: "node",
      label: `${payload.focus.role} · focus`,
      preview: payload.focus.preview,
      targetId: payload.focus.id,
    });
    payload.focus.linkedArtifacts.forEach((artifact) => {
      pushEntry({
        ref: `artifact:${artifact.id}`,
        kind: "artifact",
        label: `Artifact · ${artifact.title}`,
        preview: artifact.artifactType,
        targetId: artifact.id,
      });
    });
  }

  if (payload.focus.kind === "artifact") {
    pushEntry({
      ref: `artifact:${payload.focus.id}`,
      kind: "artifact",
      label: payload.focus.label,
      preview: payload.focus.preview,
      targetId: payload.focus.id,
    });
    payload.focus.linkedTargets.forEach((target) => {
      pushEntry({
        ref: `node:${target.id}`,
        kind: "node",
        label: `${target.role} · linked target`,
        preview: target.preview,
        targetId: target.id,
      });
    });
  }

  payload.branch.nodes.forEach((node) => {
    pushEntry({
      ref: `node:${node.id}`,
      kind: "node",
      label: `${node.role} · branch`,
      preview: node.preview,
      targetId: node.id,
    });
  });

  payload.tree.previewNodes.forEach((node) => {
    pushEntry({
      ref: `node:${node.id}`,
      kind: "node",
      label: `${node.role} · tree`,
      preview: node.preview,
      targetId: node.id,
    });
  });

  return [...entries.values()];
};
