import { estimateTokenCount, formatBytes } from "@/lib/context-budget";
import { normalizeMessages } from "@/lib/llm/messages";
import type { ProjectMemoryItem } from "@/lib/memory-documents";
import type { SessionDocument, SessionThreadExportMessage } from "@/lib/session-documents";
import { getSessionTreeStats } from "@/lib/session-context";

const encoder = new TextEncoder();

export type ProjectArenaEntryKind = "session" | "branch";

type ProjectArenaBaseEntry = {
  artifactCount: number;
  artifactTitles: string[];
  assistantCount: number;
  branchGroups: number;
  bytes: number;
  descriptor: string;
  estimatedTokens: number;
  key: string;
  kind: ProjectArenaEntryKind;
  latestAssistant: string;
  latestUser: string;
  messageCount: number;
  openingPrompt: string;
  score: number;
  sessionId: string;
  sessionTitle: string;
  title: string;
  updatedAt: string;
  userCount: number;
};

export type ProjectArenaSessionEntry = ProjectArenaBaseEntry & {
  kind: "session";
  rootCount: number;
};

export type ProjectArenaBranchEntry = ProjectArenaBaseEntry & {
  branchIdLabel: string | null;
  kind: "branch";
  rootMessageId: string;
  sourceSessionMessageCount: number;
};

export type ProjectArenaEntry = ProjectArenaSessionEntry | ProjectArenaBranchEntry;

export type ProjectArenaSummary = {
  comparedCount: number;
  freshestKey: string;
  kind: ProjectArenaEntryKind;
  leadKey: string;
  leadReason: string;
  note: string;
  sharedMemoryTitles: string[];
  summary: string;
};

const formatSessionTitle = (title: string | null) => title?.trim() || "Untitled Session";

const previewText = (value: string, max = 200) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
};

const getMessageId = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const getMessageRole = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : "message";

const getBranchIdValue = (message: Record<string, unknown>): string | null => {
  if (!Object.prototype.hasOwnProperty.call(message, "branchId")) return null;
  const value = message.branchId;
  if (value === null || value === undefined) return null;
  return String(value);
};

const normalizeEntryContent = (message: Record<string, unknown>) => {
  const normalized = normalizeMessages([message]);
  return normalized[0]?.content ?? "";
};

const buildTranscriptText = (entries: SessionThreadExportMessage[]) =>
  entries
    .map((entry) => {
      const role = getMessageRole(entry.message?.role);
      return `${role}: ${normalizeEntryContent(entry.message)}`;
    })
    .join("\n");

const getMessagePreviewFromEntries = (
  entries: SessionThreadExportMessage[],
  role: "assistant" | "user",
  direction: "first" | "last",
) => {
  const ordered = direction === "first" ? entries : [...entries].reverse();
  const match = ordered.find((entry) => {
    const entryRole = getMessageRole(entry.message?.role);
    if (entryRole !== role) return false;
    return normalizeEntryContent(entry.message).trim().length > 0;
  });
  return previewText(match ? normalizeEntryContent(match.message) : "");
};

const countBranchGroups = (entries: SessionThreadExportMessage[]) => {
  const childCountByParent = new Map<string | null, number>();
  entries.forEach((entry) => {
    const key = entry.parentId ?? null;
    childCountByParent.set(key, (childCountByParent.get(key) ?? 0) + 1);
  });
  return [...childCountByParent.values()].filter((count) => count > 1).length;
};

const collectBranchEntries = (session: SessionDocument) => {
  const byId = new Map<string, SessionThreadExportMessage>();
  const childrenByParent = new Map<string | null, string[]>();

  session.snapshot.messages.forEach((entry, index) => {
    const messageId = getMessageId(entry.message?.id, `message-${index + 1}`);
    byId.set(messageId, entry);
    const key = entry.parentId ?? null;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), messageId]);
  });

  const rootIds = session.snapshot.messages
    .map((entry, index) => ({
      messageId: getMessageId(entry.message?.id, `message-${index + 1}`),
      parentId: entry.parentId,
      role: getMessageRole(entry.message?.role),
    }))
    .filter((entry) => entry.parentId === null && entry.role === "user")
    .map((entry) => entry.messageId);

  return rootIds.map<ProjectArenaBranchEntry>((rootId, branchIndex) => {
    const subtreeIds = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || subtreeIds.has(current)) continue;
      subtreeIds.add(current);
      (childrenByParent.get(current) ?? []).forEach((childId) => queue.push(childId));
    }

    const entries = session.snapshot.messages.filter((entry, index) => {
      const messageId = getMessageId(entry.message?.id, `message-${index + 1}`);
      return subtreeIds.has(messageId);
    });
    const transcriptText = buildTranscriptText(entries);
    const bytes = encoder.encode(transcriptText).length;
    const messageCount = entries.length;
    const artifactIds = new Set(
      session.contextLinks
        .filter((link) => subtreeIds.has(link.targetMessageId))
        .map((link) => link.artifactId),
    );
    const artifactTitles = session.artifacts
      .filter((artifact) => artifactIds.has(artifact.id))
      .map((artifact) => artifact.title?.trim() || "Untitled artifact")
      .slice(0, 4);
    const branchGroups = countBranchGroups(entries);
    const rootEntry = byId.get(rootId);
    const branchIdLabel = rootEntry ? getBranchIdValue(rootEntry.message) : null;
    const titleSeed = getMessagePreviewFromEntries(entries, "user", "first");
    const title = branchIdLabel
      ? `${formatSessionTitle(session.title)} · ${branchIdLabel}`
      : `${formatSessionTitle(session.title)} · Branch ${branchIndex + 1}`;

    return {
      artifactCount: artifactIds.size,
      artifactTitles,
      assistantCount: entries.filter((entry) => getMessageRole(entry.message?.role) === "assistant").length,
      branchGroups,
      branchIdLabel,
      bytes,
      descriptor:
        branchIdLabel
          ? `${messageCount} messages · ${branchGroups} internal branch points · ${branchIdLabel}`
          : `${messageCount} messages · ${branchGroups} internal branch points`,
      estimatedTokens: estimateTokenCount(transcriptText),
      key: `${session.id}:${rootId}`,
      kind: "branch",
      latestAssistant: getMessagePreviewFromEntries(entries, "assistant", "last"),
      latestUser: getMessagePreviewFromEntries(entries, "user", "last"),
      messageCount,
      openingPrompt: titleSeed,
      rootMessageId: rootId,
      score:
        branchGroups * 5 +
        artifactIds.size * 4 +
        Math.min(messageCount, 18) +
        Math.min(entries.filter((entry) => getMessageRole(entry.message?.role) === "assistant").length, 6),
      sessionId: session.id,
      sessionTitle: formatSessionTitle(session.title),
      sourceSessionMessageCount: session.snapshot.messages.length,
      title,
      updatedAt: session.updatedAt,
      userCount: entries.filter((entry) => getMessageRole(entry.message?.role) === "user").length,
    };
  });
};

export function buildProjectArenaSessionEntry(session: SessionDocument): ProjectArenaSessionEntry {
  const treeStats = getSessionTreeStats(session.snapshot);
  const transcriptText = buildTranscriptText(session.snapshot.messages);
  const bytes = encoder.encode(transcriptText).length;
  const estimatedTokens = estimateTokenCount(transcriptText);
  const artifactCount = session.artifacts.length;
  const score =
    treeStats.siblingGroups * 5 +
    treeStats.rootCount * 4 +
    artifactCount * 3 +
    Math.min(treeStats.messageCount, 24);

  return {
    artifactCount,
    artifactTitles: session.artifacts.map((artifact) => artifact.title?.trim() || "Untitled artifact").slice(0, 4),
    assistantCount: treeStats.assistantCount,
    branchGroups: treeStats.siblingGroups,
    bytes,
    descriptor: `${treeStats.messageCount} messages · ${treeStats.rootCount} root branches`,
    estimatedTokens,
    key: session.id,
    kind: "session",
    latestAssistant: getMessagePreviewFromEntries(session.snapshot.messages, "assistant", "last"),
    latestUser: getMessagePreviewFromEntries(session.snapshot.messages, "user", "last"),
    messageCount: treeStats.messageCount,
    openingPrompt: getMessagePreviewFromEntries(session.snapshot.messages, "user", "first"),
    rootCount: treeStats.rootCount,
    score,
    sessionId: session.id,
    sessionTitle: formatSessionTitle(session.title),
    title: formatSessionTitle(session.title),
    updatedAt: session.updatedAt,
    userCount: treeStats.userCount,
  };
}

export function buildProjectArenaBranchEntries(session: SessionDocument) {
  return collectBranchEntries(session);
}

export function buildProjectArenaSummary(
  entries: ProjectArenaEntry[],
  globalContext: string,
  memoryItems: ProjectMemoryItem[] = [],
): ProjectArenaSummary | null {
  if (entries.length < 2) return null;

  const kind = entries[0]?.kind ?? "session";
  const lead = [...entries].sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0];
  const freshest = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];
  const strongestArtifacts = [...entries].sort((a, b) => b.artifactCount - a.artifactCount)[0];
  const strongestBranching = [...entries].sort((a, b) => b.branchGroups - a.branchGroups)[0];
  if (!lead || !freshest || !strongestArtifacts || !strongestBranching) return null;

  const reasons: string[] = [];
  if (kind === "session") {
    reasons.push(`${lead.title} has the richest structure with ${lead.messageCount} messages and ${lead.branchGroups} branching point${lead.branchGroups === 1 ? "" : "s"}.`);
  } else {
    reasons.push(`${lead.title} is the strongest branch with ${lead.messageCount} messages and ${lead.branchGroups} internal branch point${lead.branchGroups === 1 ? "" : "s"}.`);
  }
  if (strongestArtifacts.artifactCount > 0) {
    reasons.push(`${strongestArtifacts.title} carries the heaviest context payload with ${strongestArtifacts.artifactCount} artifact${strongestArtifacts.artifactCount === 1 ? "" : "s"}${strongestArtifacts.artifactTitles.length > 0 ? ` (${strongestArtifacts.artifactTitles.join(", ")})` : ""}.`);
  }
  if (freshest.key !== lead.key) {
    reasons.push(`${freshest.title} is the freshest compared ${kind} and may contain the newest signal.`);
  }
  if (strongestBranching.key !== lead.key && strongestBranching.branchGroups > 0) {
    reasons.push(`${strongestBranching.title} is the most exploratory comparison partner with ${strongestBranching.branchGroups} branch point${strongestBranching.branchGroups === 1 ? "" : "s"}.`);
  }
  const sharedMemoryTitles = memoryItems.map((item) => item.title).slice(0, 6);
  if (sharedMemoryTitles.length > 0) {
    reasons.push(`Reusable memory in scope: ${sharedMemoryTitles.join(", ")}.`);
  }

  const summary = [
    globalContext.trim()
      ? `Global context is set, so the lead ${kind} should reinforce that shared goal.`
      : `There is no global context yet, so the lead ${kind} can seed the project's north star.`,
    `${lead.title} is the current lead candidate for synthesis.`,
    reasons.join(" "),
  ].join(" ");

  const note = [
    `Project Arena ${kind} synthesis`,
    `Compared ${kind === "session" ? "sessions" : "branches"}: ${entries.map((entry) => entry.title).join(", ")}.`,
    `Lead candidate: ${lead.title}.`,
    `Why: ${reasons.join(" ")}`,
    `Opening prompt to keep in view: ${lead.openingPrompt}`,
    `Latest assistant signal: ${lead.latestAssistant}`,
    sharedMemoryTitles.length > 0 ? `Reusable memory in scope: ${sharedMemoryTitles.join(", ")}.` : "",
    `Combined footprint across compared ${kind === "session" ? "sessions" : "branches"}: ${entries.reduce((total, entry) => total + entry.estimatedTokens, 0)} estimated tokens / ${formatBytes(entries.reduce((total, entry) => total + entry.bytes, 0))}.`,
  ].filter(Boolean).join("\n");

  return {
    comparedCount: entries.length,
    freshestKey: freshest.key,
    kind,
    leadKey: lead.key,
    leadReason: reasons.join(" "),
    note,
    sharedMemoryTitles,
    summary,
  };
}
