import type { CanvasGuideGraphNode } from "@/lib/canvas-agent/canvas-agent-context";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";

export type SessionWikiPageId = "overview" | "branches" | "artifacts" | "focus" | "open-questions";

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
  nodes: CanvasGuideGraphNode[];
  selectedNodeId: string | null;
  sessionTitle: string | null;
};

const trimText = (value: string, maxLength = 180) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const getBranchNodes = (nodes: CanvasGuideGraphNode[], anchorId: string) => {
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

  const overviewPage: SessionWikiPage = {
    id: "overview",
    title: "Overview",
    summary: `${sessionTitle?.trim() || "Untitled session"} has ${nonRootNodes.length} canvas nodes, ${rootBranches.length} root branches, and ${artifacts.length} attached artifacts.`,
    body: [
      `Session: ${sessionTitle?.trim() || "Untitled session"}`,
      `Nodes: ${nonRootNodes.length}`,
      `Root branches: ${rootBranches.length}`,
      `Artifacts: ${artifacts.length}`,
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
        ? `${artifacts.length} reusable artifacts are linked into this session.`
        : "No reusable artifacts are attached yet.",
    body:
      artifacts.length === 0
        ? "No artifacts are attached to the current session."
        : artifacts
            .slice(0, 12)
            .map((artifact) => {
              const links = contextLinks.filter((link) => link.artifactId === artifact.id);
              return [
                `## ${artifact.title}`,
                `Type: ${artifact.artifactType}`,
                `Linked targets: ${links.length}`,
                `Preview: ${trimText(artifact.content || artifact.fileName || `${artifact.artifactType} artifact`, 220)}`,
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
        ? `Current focus is artifact ${selectedArtifact.title}`
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
            `Type: ${selectedArtifact.artifactType}`,
            "",
            trimText(selectedArtifact.content || selectedArtifact.fileName || "No preview available.", 420),
          ].join("\n")
        : "Nothing is selected. Use the canvas to focus a node or artifact and this page will update.",
  };

  const questionNodes = nonRootNodes.filter(
    (node) => node.role === "user" && /[?？]$/.test(node.text.trim()),
  );
  const openQuestionsPage: SessionWikiPage = {
    id: "open-questions",
    title: "Open Questions",
    summary:
      questionNodes.length > 0
        ? `${questionNodes.length} explicit user questions are visible in the current session.`
        : "No explicit open questions were detected from user prompts.",
    body:
      questionNodes.length === 0
        ? "No question-shaped user prompts were detected."
        : questionNodes
            .slice(0, 12)
            .map((node, index) => `- Q${index + 1}: ${trimText(node.text, 220)}`)
            .join("\n"),
  };

  const pages = [overviewPage, branchPage, artifactPage, focusPage, openQuestionsPage];
  const digest = pages
    .map((page) => `# ${page.title}\n${page.summary}\n\n${page.body}`)
    .join("\n\n");

  return { digest, pages };
}
