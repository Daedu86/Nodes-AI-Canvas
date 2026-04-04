import { normalizeMessageContent } from "@/lib/llm/messages";
import type { ProjectMemoryItem } from "@/lib/memory-documents";
import { formatProjectMemoryTypeLabel, PROJECT_MEMORY_TYPE_ORDER } from "@/lib/project-memory-meta";
import type { ProjectDocument } from "@/lib/project-documents";
import { getSessionTreeStats } from "@/lib/session-context";
import type { SessionDocument } from "@/lib/session-documents";

export type ProjectWikiPageId =
  | "overview"
  | "sessions"
  | "knowledge"
  | "decisions"
  | "focus"
  | "open-questions";

export type ProjectWikiFocus =
  | {
      kind: "edge";
      label: string;
      preview: string;
      sessionId: string | null;
    }
  | {
      kind: "node";
      label: string;
      memoryId?: string | null;
      memoryType?: string | null;
      preview: string;
      role: string;
      sessionId: string | null;
      sessionTitle: string | null;
    }
  | null;

export type ProjectWikiPage = {
  body: string;
  id: ProjectWikiPageId;
  summary: string;
  title: string;
};

export type ProjectWiki = {
  digest: string;
  pages: ProjectWikiPage[];
};

type BuildProjectWikiArgs = {
  focus: ProjectWikiFocus;
  memoryItems: ProjectMemoryItem[];
  project: ProjectDocument;
  sessions: SessionDocument[];
};

const formatProjectTitle = (title: string | null) => title?.trim() || "Untitled Project";
const formatSessionTitle = (title: string | null) => title?.trim() || "Untitled Session";

const trimText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const extractMessageText = (message: Record<string, unknown>) => {
  const normalized = normalizeMessageContent(message.parts) ?? normalizeMessageContent(message.content);
  return normalized?.textContent?.trim() || normalized?.content?.trim() || "";
};

const buildSessionSummaryBlock = (session: SessionDocument) => {
  const stats = getSessionTreeStats(session.snapshot);
  const latestMessage = [...session.snapshot.messages]
    .reverse()
    .map((entry) => extractMessageText(entry.message))
    .find((text) => text.length > 0);

  return [
    `## ${formatSessionTitle(session.title)}`,
    `Messages: ${stats.messageCount} total · ${stats.userCount} user · ${stats.assistantCount} assistant`,
    `Structure: ${stats.rootCount} root branches · ${stats.siblingGroups} branching points`,
    `Artifacts: ${session.artifacts.length} · Context links: ${session.contextLinks.length}`,
    `Latest signal: ${trimText(latestMessage || "No message preview available.", 200)}`,
  ].join("\n");
};

export function buildProjectWiki({
  focus,
  memoryItems,
  project,
  sessions,
}: BuildProjectWikiArgs): ProjectWiki {
  const orderedSessions = project.sessionIds
    .map((sessionId) => sessions.find((session) => session.id === sessionId))
    .filter((session): session is SessionDocument => Boolean(session));
  const totalMessages = orderedSessions.reduce((sum, session) => sum + session.snapshot.messages.length, 0);
  const totalArtifacts = orderedSessions.reduce((sum, session) => sum + session.artifacts.length, 0);
  const groupedMemory = PROJECT_MEMORY_TYPE_ORDER.map((type) => ({
    items: memoryItems.filter((item) => item.type === type),
    type,
  })).filter((group) => group.items.length > 0);

  const winnerLabel = project.arenaWinnerBranchKey
    ? `Branch winner · ${project.arenaWinnerBranchKey}`
    : project.arenaWinnerSessionId
      ? `Session winner · ${formatSessionTitle(
          orderedSessions.find((session) => session.id === project.arenaWinnerSessionId)?.title ?? null,
        )}`
      : "No arena winner has been promoted yet.";

  const overviewPage: ProjectWikiPage = {
    id: "overview",
    title: "Overview",
    summary: `${formatProjectTitle(project.title)} combines ${orderedSessions.length} sessions, ${totalMessages} messages, ${memoryItems.length} typed nodes, and ${project.members.length + 1} collaborators.`,
    body: [
      `Project: ${formatProjectTitle(project.title)}`,
      `Sessions: ${orderedSessions.length}`,
      `Messages: ${totalMessages}`,
      `Artifacts: ${totalArtifacts}`,
      `Typed nodes: ${memoryItems.length}`,
      `Collaborators: ${project.members.length + 1}`,
      `Arena promotion: ${winnerLabel}`,
      "",
      "Global context:",
      project.globalContext.trim() || "No shared project context has been written yet.",
    ].join("\n"),
  };

  const sessionsPage: ProjectWikiPage = {
    id: "sessions",
    title: "Sessions",
    summary:
      orderedSessions.length > 0
        ? `${orderedSessions.length} sessions currently feed the shared project canvas.`
        : "No saved sessions are attached to this project yet.",
    body:
      orderedSessions.length === 0
        ? "No sessions are attached to the project yet."
        : orderedSessions.map(buildSessionSummaryBlock).join("\n\n"),
  };

  const knowledgePage: ProjectWikiPage = {
    id: "knowledge",
    title: "Knowledge",
    summary:
      memoryItems.length > 0
        ? `${memoryItems.length} typed nodes plus the global context are currently acting as the reusable project knowledge layer.`
        : "The reusable knowledge layer is still empty beyond the global context.",
    body: [
      "## Global context",
      project.globalContext.trim() || "No shared context drafted yet.",
      "",
      "## Typed nodes",
      groupedMemory.length === 0
        ? "No typed nodes are attached yet."
        : groupedMemory
            .map((group) =>
              [
                `### ${formatProjectMemoryTypeLabel(group.type)} (${group.items.length})`,
                ...group.items.slice(0, 6).map((item) => `- ${item.title}: ${trimText(item.content, 180)}`),
              ].join("\n"),
            )
            .join("\n\n"),
    ].join("\n"),
  };

  const decisionItems = memoryItems.filter((item) => item.type === "decision" || item.type === "merge");
  const decisionsPage: ProjectWikiPage = {
    id: "decisions",
    title: "Decisions",
    summary:
      decisionItems.length > 0
        ? `${decisionItems.length} decision-oriented typed nodes are attached, alongside the current arena promotion state.`
        : winnerLabel,
    body: [
      "## Promoted winner",
      winnerLabel,
      "",
      "## Decision and merge nodes",
      decisionItems.length === 0
        ? "No decision or merge nodes have been attached yet."
        : decisionItems
            .map((item) => {
              const sourceLabel =
                item.sourceSessionId
                  ? formatSessionTitle(orderedSessions.find((session) => session.id === item.sourceSessionId)?.title ?? null)
                  : "project";
              return [
                `### ${item.title}`,
                `Type: ${formatProjectMemoryTypeLabel(item.type)} · Source: ${sourceLabel}`,
                trimText(item.content, 260),
              ].join("\n");
            })
            .join("\n\n"),
    ].join("\n"),
  };

  const focusPage: ProjectWikiPage = {
    id: "focus",
    title: "Focus",
    summary: focus
      ? `Current project focus is ${focus.label}.`
      : "No project-level focus is selected right now.",
    body: !focus
      ? "Nothing is selected on the project canvas right now. Select a node or branch to pin it here."
      : focus.kind === "edge"
        ? [
            `Selected branch: ${focus.label}`,
            "",
            trimText(focus.preview, 420),
          ].join("\n")
        : [
            `Selected node: ${focus.label}`,
            `Role: ${focus.role}`,
            focus.sessionTitle ? `Session: ${focus.sessionTitle}` : null,
            focus.memoryType ? `Typed node: ${focus.memoryType}` : null,
            "",
            trimText(focus.preview, 420),
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
  };

  const questionMemoryItems = memoryItems.filter((item) => item.type === "question");
  const explicitQuestions = orderedSessions.flatMap((session) =>
    session.snapshot.messages.flatMap((entry) => {
      const role = typeof entry.message.role === "string" ? entry.message.role : null;
      if (role !== "user") return [];
      const text = extractMessageText(entry.message);
      if (!text || !/[?？]$/.test(text.trim())) return [];
      return [`${formatSessionTitle(session.title)}: ${trimText(text, 200)}`];
    }),
  );
  const openQuestionsPage: ProjectWikiPage = {
    id: "open-questions",
    title: "Open Questions",
    summary:
      questionMemoryItems.length + explicitQuestions.length > 0
        ? `${questionMemoryItems.length} question nodes and ${explicitQuestions.length} unresolved user prompts are visible across the project.`
        : "No explicit open questions are currently preserved in the project knowledge layer.",
    body: [
      "## Question nodes",
      questionMemoryItems.length === 0
        ? "No question-type nodes attached."
        : questionMemoryItems
            .map((item) => `- ${item.title}: ${trimText(item.content, 200)}`)
            .join("\n"),
      "",
      "## Unresolved user prompts",
      explicitQuestions.length === 0 ? "No explicit question-shaped prompts detected." : explicitQuestions.map((entry) => `- ${entry}`).join("\n"),
    ].join("\n"),
  };

  const pages = [
    overviewPage,
    sessionsPage,
    knowledgePage,
    decisionsPage,
    focusPage,
    openQuestionsPage,
  ];

  return {
    digest: pages.map((page) => `# ${page.title}\n${page.summary}\n\n${page.body}`).join("\n\n"),
    pages,
  };
}
