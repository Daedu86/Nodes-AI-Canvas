import {
  getSemanticArtifactLabel,
  getSemanticArtifactRole,
  getSessionArtifactDisplayLabel,
  getSessionArtifactPreview,
  type SessionArtifact,
  type SessionContextLink,
} from "@/lib/session-artifacts";

export type SessionWikiNode = {
  branchId?: string | number | null;
  id: string;
  parentId: string | null;
  role: string;
  text: string;
};

export type SessionWikiPageId =
  | "overview"
  | "branches"
  | "artifacts"
  | "decisions"
  | "focus"
  | "open-questions";

export type SessionWikiPage = {
  body: string;
  id: SessionWikiPageId;
  summary: string;
  title: string;
};

export type SessionWiki = {
  digest: string;
  pages: SessionWikiPage[];
};

type BuildSessionWikiArgs = {
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  nodes: SessionWikiNode[];
  selectedNodeId: string | null;
  sessionTitle: string | null;
};

const trimText = (value: string, maxLength = 180) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const buildSemanticArtifactSummary = (artifacts: SessionArtifact[]) => {
  const counts = new Map<string, number>();
  artifacts.forEach((artifact) => {
    if (artifact.artifactType !== "text" || !artifact.semanticType) return;
    const label = getSemanticArtifactLabel(artifact.semanticType);
    if (!label) return;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, count]) => `${count} ${label.toLowerCase()}${count === 1 ? "" : "s"}`);
};

const getBranchNodes = (nodes: SessionWikiNode[], anchorId: string) => {
  const branchIds = new Set<string>([anchorId]);
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

export function buildSessionWiki({
  artifacts,
  contextLinks,
  nodes,
  selectedNodeId,
  sessionTitle,
}: BuildSessionWikiArgs): SessionWiki {
  const nonRootNodes = nodes.filter((node) => node.id !== "__ROOT__");
  const rootBranches = nonRootNodes.filter((node) => node.parentId === "__ROOT__");
  const selectedNode = selectedNodeId
    ? nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedArtifact = selectedNodeId
    ? artifacts.find((artifact) => artifact.id === selectedNodeId) ?? null
    : null;
  const decisionArtifacts = artifacts.filter(
    (artifact) => artifact.artifactType === "text" && artifact.semanticType === "decision",
  );
  const questionArtifacts = artifacts.filter(
    (artifact) => artifact.artifactType === "text" && artifact.semanticType === "question",
  );
  const semanticSignals = buildSemanticArtifactSummary(artifacts);

  const overviewPage: SessionWikiPage = {
    id: "overview",
    title: "Overview",
    summary: `${sessionTitle?.trim() || "Untitled session"} has ${nonRootNodes.length} canvas nodes, ${rootBranches.length} root branches, and ${artifacts.length} attached artifacts${semanticSignals.length > 0 ? ` (${semanticSignals.join(", ")})` : ""}.`,
    body: [
      `Session: ${sessionTitle?.trim() || "Untitled session"}`,
      `Nodes: ${nonRootNodes.length}`,
      `Root branches: ${rootBranches.length}`,
      `Artifacts: ${artifacts.length}`,
      ...(semanticSignals.length > 0
        ? [
            "",
            `Semantic artifacts: ${semanticSignals.join(", ")}`,
          ]
        : []),
      "",
      "Root branch anchors:",
      ...rootBranches.slice(0, 8).map((node, index) => `- Branch ${index + 1}: ${node.role} · ${trimText(node.text, 140)}`),
    ].join("\n"),
  };

  const branchPage: SessionWikiPage = {
    id: "branches",
    title: "Branches",
    summary:
      rootBranches.length > 0
        ? `${rootBranches.length} active root branches are available in the canvas.`
        : "No branches have been formed yet.",
    body:
      rootBranches.length === 0
        ? "No root branches are available yet."
        : rootBranches
            .slice(0, 8)
            .map((root, index) => {
              const branchNodes = getBranchNodes(nonRootNodes, root.id);
              const finalNode = branchNodes.at(-1) ?? root;
              return [
                `## Branch ${index + 1}`,
                `Anchor: ${root.role} · ${trimText(root.text, 180)}`,
                `Nodes in branch: ${branchNodes.length}`,
                `Latest state: ${finalNode.role} · ${trimText(finalNode.text, 200)}`,
              ].join("\n");
            })
            .join("\n\n"),
  };

  const artifactPage: SessionWikiPage = {
    id: "artifacts",
    title: "Artifacts",
    summary:
      artifacts.length > 0
        ? `${artifacts.length} reusable artifacts are linked into this session${semanticSignals.length > 0 ? `, including ${semanticSignals.join(", ")}` : ""}.`
        : "No reusable artifacts are attached yet.",
    body:
      artifacts.length === 0
        ? "No artifacts are attached to the current session."
        : artifacts
            .slice(0, 12)
            .map((artifact) => {
              const links = contextLinks.filter((link) => link.artifactId === artifact.id);
              const semanticRole = getSemanticArtifactRole(artifact.semanticType);
              return [
                `## ${artifact.title}`,
                `Type: ${getSessionArtifactDisplayLabel(artifact)} artifact`,
                ...(semanticRole ? [`Role: ${semanticRole}`] : []),
                `Linked targets: ${links.length}`,
                `Preview: ${getSessionArtifactPreview(artifact, 220)}`,
              ].join("\n");
            })
            .join("\n\n"),
  };

  const decisionsPage: SessionWikiPage = {
    id: "decisions",
    title: "Decisions",
    summary:
      decisionArtifacts.length > 0
        ? `${decisionArtifacts.length} decision artifact${decisionArtifacts.length === 1 ? "" : "s"} are shaping the current session.`
        : "No explicit decision artifacts are pinned yet.",
    body:
      decisionArtifacts.length === 0
        ? "No decision artifacts are attached to the current session."
        : decisionArtifacts
            .slice(0, 10)
            .map((artifact, index) => {
              const links = contextLinks.filter((link) => link.artifactId === artifact.id);
              return [
                `## Decision ${index + 1}`,
                `Title: ${artifact.title}`,
                `Linked targets: ${links.length}`,
                `Summary: ${getSessionArtifactPreview(artifact, 240)}`,
              ].join("\n");
            })
            .join("\n\n"),
  };

  const focusPage: SessionWikiPage = {
    id: "focus",
    title: "Focus",
    summary: selectedNode
      ? `Current focus is ${selectedNode.role} · ${trimText(selectedNode.text, 120)}`
      : selectedArtifact
        ? `Current focus is ${getSessionArtifactDisplayLabel(selectedArtifact).toLowerCase()} artifact ${selectedArtifact.title}`
        : "No specific focus is selected in the canvas right now.",
    body: selectedNode
      ? [
          `Selected node: ${selectedNode.role}`,
          `Branch: ${selectedNode.branchId ?? "root"}`,
          "",
          trimText(selectedNode.text, 420),
        ].join("\n")
      : selectedArtifact
        ? [
            `Selected artifact: ${selectedArtifact.title}`,
            `Type: ${getSessionArtifactDisplayLabel(selectedArtifact)} artifact`,
            ...(selectedArtifact.semanticType
              ? [`Role: ${getSemanticArtifactRole(selectedArtifact.semanticType)}`]
              : []),
            "",
            getSessionArtifactPreview(selectedArtifact, 420),
          ].join("\n")
        : "Nothing is selected. Use the canvas to focus a node or artifact and this page will update.",
  };

  const questionNodes = nonRootNodes.filter(
    (node) => node.role === "user" && /[?？]$/.test(node.text.trim()),
  );
  const openQuestionLines = [
    ...questionArtifacts.map(
      (artifact) => `Artifact · ${artifact.title}: ${getSessionArtifactPreview(artifact, 220)}`,
    ),
    ...questionNodes.map((node) => trimText(node.text, 220)),
  ].filter((entry, index, array) => array.indexOf(entry) === index);
  const openQuestionsPage: SessionWikiPage = {
    id: "open-questions",
    title: "Open Questions",
    summary:
      openQuestionLines.length > 0
        ? `${openQuestionLines.length} open question${openQuestionLines.length === 1 ? "" : "s"} are visible in the current session.`
        : "No explicit open questions were detected from user prompts.",
    body:
      openQuestionLines.length === 0
        ? "No question artifacts or question-shaped user prompts were detected."
        : openQuestionLines
            .slice(0, 12)
            .map((line, index) => `- Q${index + 1}: ${line}`)
            .join("\n"),
  };

  const pages = [overviewPage, branchPage, artifactPage, decisionsPage, focusPage, openQuestionsPage];
  const digest = pages
    .map((page) => `# ${page.title}\n${page.summary}\n\n${page.body}`)
    .join("\n\n");

  return { digest, pages };
}
