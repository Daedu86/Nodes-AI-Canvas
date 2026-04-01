import { estimateTokenCount } from "@/lib/context-budget";
import type { ProjectMemoryItem } from "@/lib/memory-documents";
import { PROJECT_MEMORY_META, formatProjectMemoryTypeLabel } from "@/lib/project-memory-meta";
import type { ProjectDocument } from "@/lib/project-documents";
import { buildProjectArenaSessionEntry, type ProjectArenaBranchEntry } from "@/lib/project-arena";
import type { SessionDocument } from "@/lib/session-documents";

export type ProjectContextSourceCategory =
  | "arena"
  | "winner"
  | "memory"
  | "session"
  | "focus";

export type ProjectContextFocus = {
  kind: "edge" | "node";
  label: string;
  memoryId?: string | null;
  memoryType?: string | null;
  preview: string;
  role?: string;
  sessionId: string | null;
  sessionTitle?: string | null;
} | null;

export type ProjectContextSource = {
  bytes: number;
  category: ProjectContextSourceCategory;
  content: string;
  description: string;
  estimatedTokens: number;
  id: string;
  label: string;
  title: string;
};

export type ProjectContextDraft = {
  bytes: number;
  estimatedTokens: number;
  text: string;
};

const encoder = new TextEncoder();

const compactText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const buildSource = ({
  category,
  content,
  description,
  id,
  label,
  title,
}: Omit<ProjectContextSource, "bytes" | "estimatedTokens">): ProjectContextSource => ({
  bytes: encoder.encode(content).length,
  category,
  content,
  description,
  estimatedTokens: estimateTokenCount(content),
  id,
  label,
  title,
});

const buildSessionSource = (session: SessionDocument) => {
  const entry = buildProjectArenaSessionEntry(session);
  const content = [
    `[Session] ${entry.title}`,
    `Messages: ${entry.messageCount}. Root branches: ${entry.rootCount}. Branching points: ${entry.branchGroups}. Artifacts: ${entry.artifactCount}.`,
    `Opening prompt: ${entry.openingPrompt}`,
    `Latest assistant signal: ${entry.latestAssistant}`,
    `Latest user signal: ${entry.latestUser}`,
  ].join("\n");

  return buildSource({
    category: "session",
    content,
    description: `${entry.messageCount} messages · ${entry.rootCount} roots · ${entry.artifactCount} artifacts`,
    id: `session:${session.id}`,
    label: "Session",
    title: entry.title,
  });
};

const buildMemorySource = (item: ProjectMemoryItem) => {
  const label = formatProjectMemoryTypeLabel(item.type);
  const content = [`[${label}] ${item.title}`, item.content.trim()].filter(Boolean).join("\n\n");
  return buildSource({
    category: "memory",
    content,
    description: PROJECT_MEMORY_META[item.type].description,
    id: `memory:${item.id}`,
    label,
    title: item.title,
  });
};

const buildArenaSource = (
  summary: NonNullable<Parameters<typeof buildProjectContextSources>[0]["arenaSummary"]>,
) =>
  buildSource({
    category: "arena",
    content: [`[Arena synthesis] Lead candidate`, summary.note].join("\n\n"),
    description: summary.summary,
    id: "arena:summary",
    label: "Arena synthesis",
    title: "Arena synthesis",
  });

const buildWinnerSource = ({
  branchCatalog,
  project,
  sessions,
}: {
  branchCatalog: ProjectArenaBranchEntry[];
  project: ProjectDocument;
  sessions: SessionDocument[];
}) => {
  if (project.arenaWinnerBranchKey) {
    const branch = branchCatalog.find((entry) => entry.key === project.arenaWinnerBranchKey);
    if (!branch) return null;
    return buildSource({
      category: "winner",
      content: [
        `[Arena winner branch] ${branch.title}`,
        branch.descriptor,
        `Opening prompt: ${branch.openingPrompt}`,
        `Latest assistant signal: ${branch.latestAssistant}`,
        `Latest user signal: ${branch.latestUser}`,
      ].join("\n"),
      description: `${branch.messageCount} messages · source ${branch.sessionTitle}`,
      id: `winner:branch:${branch.key}`,
      label: "Winner branch",
      title: branch.title,
    });
  }

  if (project.arenaWinnerSessionId) {
    const session = sessions.find((entry) => entry.id === project.arenaWinnerSessionId);
    if (!session) return null;
    const entry = buildProjectArenaSessionEntry(session);
    return buildSource({
      category: "winner",
      content: [
        `[Arena winner session] ${entry.title}`,
        entry.descriptor,
        `Opening prompt: ${entry.openingPrompt}`,
        `Latest assistant signal: ${entry.latestAssistant}`,
        `Latest user signal: ${entry.latestUser}`,
      ].join("\n"),
      description: `${entry.messageCount} messages · ${entry.rootCount} roots`,
      id: `winner:session:${entry.sessionId}`,
      label: "Winner session",
      title: entry.title,
    });
  }

  return null;
};

const buildFocusSource = (focus: ProjectContextFocus) => {
  if (!focus) return null;
  const focusBits = [
    focus.kind === "edge" ? "Canvas branch" : "Canvas focus",
    focus.role ? `role=${focus.role}` : null,
    focus.sessionTitle ? `session=${focus.sessionTitle}` : null,
    focus.memoryType ? `memory=${focus.memoryType}` : null,
  ].filter(Boolean);

  return buildSource({
    category: "focus",
    content: [`[Canvas focus] ${focus.label}`, focus.preview.trim()].filter(Boolean).join("\n\n"),
    description: focusBits.join(" · "),
    id: `focus:${focus.kind}:${focus.sessionId ?? "global"}:${focus.memoryId ?? focus.label}`,
    label: focus.kind === "edge" ? "Canvas branch" : "Canvas focus",
    title: focus.label,
  });
};

export function buildProjectContextSources({
  arenaSummary,
  attachedMemoryItems,
  branchCatalog,
  project,
  selectedFocus,
  sessions,
}: {
  arenaSummary: import("@/lib/project-arena").ProjectArenaSummary | null;
  attachedMemoryItems: ProjectMemoryItem[];
  branchCatalog: ProjectArenaBranchEntry[];
  project: ProjectDocument;
  selectedFocus: ProjectContextFocus;
  sessions: SessionDocument[];
}) {
  const sources: ProjectContextSource[] = [];

  if (arenaSummary) {
    sources.push(buildArenaSource(arenaSummary));
  }

  const winnerSource = buildWinnerSource({ branchCatalog, project, sessions });
  if (winnerSource) {
    sources.push(winnerSource);
  }

  const focusSource = buildFocusSource(selectedFocus);
  if (focusSource) {
    sources.push(focusSource);
  }

  attachedMemoryItems
    .slice()
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .forEach((item) => {
      sources.push(buildMemorySource(item));
    });

  sessions.forEach((session) => {
    sources.push(buildSessionSource(session));
  });

  return sources;
}

export function buildProjectContextDraft(sources: ProjectContextSource[]): ProjectContextDraft {
  const uniqueTexts = new Set<string>();
  const blocks: string[] = [];

  sources.forEach((source) => {
    const normalized = source.content.trim();
    if (!normalized || uniqueTexts.has(normalized)) return;
    uniqueTexts.add(normalized);
    blocks.push(normalized);
  });

  const text = blocks.join("\n\n---\n\n");
  return {
    bytes: encoder.encode(text).length,
    estimatedTokens: estimateTokenCount(text),
    text,
  };
}

export function getDefaultProjectContextSourceIds(sources: ProjectContextSource[]) {
  const preferred = sources.filter((source) => {
    if (source.category === "arena" || source.category === "winner") return true;
    if (source.category !== "memory") return false;
    return (
      source.label === "Decision" ||
      source.label === "Summary" ||
      source.label === "Merge"
    );
  });

  return preferred.map((source) => source.id);
}

export function getProjectContextSourceCategoryLabel(category: ProjectContextSourceCategory) {
  switch (category) {
    case "arena":
      return "Arena";
    case "winner":
      return "Winner";
    case "memory":
      return "Typed node";
    case "session":
      return "Session";
    case "focus":
      return "Canvas focus";
    default:
      return "Source";
  }
}

export function getProjectContextSourcePreview(source: ProjectContextSource) {
  return compactText(source.description || source.content);
}
