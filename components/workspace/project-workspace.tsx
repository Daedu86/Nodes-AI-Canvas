"use client";

import React from "react";
import { ArrowUpRight, BarChart3, BookCopy, GitBranchPlus, Network, PlusIcon, Trash2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useProjects } from "@/components/context/projects";
import { useReusableMemory } from "@/components/context/reusable-memory";
import { estimateTokenCount, formatBytes } from "@/lib/context-budget";
import { normalizeMessages, toPlainTextTranscript } from "@/lib/llm/messages";
import { PROJECT_MEMORY_TYPES, type ProjectMemoryType } from "@/lib/memory-documents";
import type { ProjectDocument } from "@/lib/project-documents";
import type { SessionDocument, SessionSummary } from "@/lib/session-documents";
import { ProjectCanvas, type ProjectCanvasSelection } from "@/components/workspace/project-canvas";
import { ProjectArena } from "@/components/workspace/project-arena";
import {
  buildProjectArenaBranchEntries,
  type ProjectArenaBranchEntry,
  type ProjectArenaEntry,
  buildProjectArenaSessionEntry,
  buildProjectArenaSummary,
} from "@/lib/project-arena";

type SessionResponse = {
  session: SessionDocument;
};

type ArenaCompareMode = "sessions" | "branches";

const encoder = new TextEncoder();

const formatProjectTitle = (title: string | null) => title?.trim() || "Untitled Project";
const formatSessionTitle = (title: string | null) => title?.trim() || "Untitled Session";
const formatMemoryTitle = (title: string) => title.trim() || "Untitled Memory";
const formatMemoryTypeLabel = (type: ProjectMemoryType) => `${type.slice(0, 1).toUpperCase()}${type.slice(1)}`;
const formatProjectWinnerLabel = ({
  branchCatalog,
  memberSessions,
  project,
}: {
  branchCatalog: ProjectArenaBranchEntry[];
  memberSessions: SessionDocument[];
  project: ProjectDocument;
}) => {
  if (project.arenaWinnerBranchKey) {
    return branchCatalog.find((entry) => entry.key === project.arenaWinnerBranchKey)?.title ?? "Branch winner";
  }
  if (project.arenaWinnerSessionId) {
    return memberSessions.find((session) => session.id === project.arenaWinnerSessionId)?.title?.trim() || "Session winner";
  }
  return "Not set";
};

const formatUpdatedAt = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const SectionCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 shadow-sm">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

async function loadSessionDocument(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as SessionResponse;
  return data.session;
}

export function ProjectWorkspace() {
  const {
    activeProject,
    clearActiveProject,
    saveActiveProjectPatch,
  } = useProjects();
  const { selectSession, sessions: sessionSummaries } = usePersistedSessions();
  const { createMemoryItem, deleteMemoryItem, isReady: isMemoryReady, items: memoryItems } = useReusableMemory();
  const [memberSessions, setMemberSessions] = React.useState<SessionDocument[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(false);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [selectedCanvasItem, setSelectedCanvasItem] = React.useState<ProjectCanvasSelection>(null);
  const [titleDraft, setTitleDraft] = React.useState(activeProject?.title ?? "");
  const [globalContextDraft, setGlobalContextDraft] = React.useState(activeProject?.globalContext ?? "");
  const [contextSaveState, setContextSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [workspaceMode, setWorkspaceMode] = React.useState<"canvas" | "arena">("canvas");
  const [arenaCompareMode, setArenaCompareMode] = React.useState<ArenaCompareMode>("sessions");
  const [arenaSessionIds, setArenaSessionIds] = React.useState<string[]>([]);
  const [arenaBranchKeys, setArenaBranchKeys] = React.useState<string[]>([]);
  const [memoryTitleDraft, setMemoryTitleDraft] = React.useState("Arena synthesis");
  const [memoryTypeDraft, setMemoryTypeDraft] = React.useState<ProjectMemoryType>("summary");
  const [memoryActionState, setMemoryActionState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  React.useEffect(() => {
    setTitleDraft(activeProject?.title ?? "");
    setGlobalContextDraft(activeProject?.globalContext ?? "");
    setSelectedCanvasItem(null);
    setContextSaveState("idle");
    setMemoryActionState("idle");
    setMemoryTitleDraft("Arena synthesis");
    setMemoryTypeDraft("summary");
    setWorkspaceMode("canvas");
    setArenaCompareMode("sessions");
    setArenaSessionIds([]);
    setArenaBranchKeys([]);
  }, [activeProject?.globalContext, activeProject?.id, activeProject?.title]);

  const activeProjectId = activeProject?.id ?? null;
  const memberSessionIdsKey = activeProject?.sessionIds.join("|") ?? "";
  const activeProjectSessionIds = React.useMemo(
    () => activeProject?.sessionIds ?? [],
    [activeProject?.sessionIds],
  );

  React.useEffect(() => {
    let mounted = true;

    const loadMembers = async () => {
      if (!activeProjectId) {
        if (mounted) {
          setMemberSessions([]);
          setLoadingMembers(false);
          setMemberError(null);
        }
        return;
      }

      setLoadingMembers(true);
      setMemberError(null);
      try {
        const loaded = await Promise.all(activeProjectSessionIds.map((sessionId) => loadSessionDocument(sessionId)));
        if (!mounted) return;
        setMemberSessions(loaded.filter((session): session is SessionDocument => session !== null));
      } catch (error) {
        if (!mounted) return;
        setMemberError(error instanceof Error ? error.message : "Failed to load project sessions.");
        setMemberSessions([]);
      } finally {
        if (mounted) {
          setLoadingMembers(false);
        }
      }
    };

    void loadMembers();

    return () => {
      mounted = false;
    };
  }, [activeProjectId, activeProjectSessionIds, memberSessionIdsKey]);

  React.useEffect(() => {
    if (!activeProject) return;
    if (globalContextDraft === activeProject.globalContext) return;

    setContextSaveState("saving");
    const timeout = window.setTimeout(() => {
      void saveActiveProjectPatch({ globalContext: globalContextDraft })
        .then(() => setContextSaveState("saved"))
        .catch(() => setContextSaveState("error"));
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [activeProject, globalContextDraft, saveActiveProjectPatch]);

  const handleCommitTitle = React.useCallback(async () => {
    if (!activeProject) return;
    const normalizedTitle = titleDraft.trim() || null;
    if ((activeProject.title ?? null) === normalizedTitle) return;
    await saveActiveProjectPatch({ title: normalizedTitle });
  }, [activeProject, saveActiveProjectPatch, titleDraft]);

  const handleOpenSession = React.useCallback((sessionId: string) => {
    clearActiveProject();
    void selectSession(sessionId);
  }, [clearActiveProject, selectSession]);

  const handleAddSession = React.useCallback(async (sessionId: string) => {
    if (!activeProject) return;
    if (activeProject.sessionIds.includes(sessionId)) return;
    await saveActiveProjectPatch({
      sessionIds: [...activeProject.sessionIds, sessionId],
    });
  }, [activeProject, saveActiveProjectPatch]);

  const handleRemoveSession = React.useCallback(async (sessionId: string) => {
    if (!activeProject) return;
    const branchWinnerBelongsToRemovedSession =
      typeof activeProject.arenaWinnerBranchKey === "string" &&
      activeProject.arenaWinnerBranchKey.startsWith(`${sessionId}:`);
    await saveActiveProjectPatch({
      arenaWinnerBranchKey: branchWinnerBelongsToRemovedSession ? null : activeProject.arenaWinnerBranchKey,
      arenaWinnerSessionId:
        activeProject.arenaWinnerSessionId === sessionId ? null : activeProject.arenaWinnerSessionId,
      sessionIds: activeProject.sessionIds.filter((entry) => entry !== sessionId),
    });
  }, [activeProject, saveActiveProjectPatch]);

  const availableSessions = React.useMemo(() => {
    if (!activeProject) return [] satisfies SessionSummary[];
    const included = new Set(activeProject.sessionIds);
    return sessionSummaries.filter((session) => !included.has(session.id));
  }, [activeProject, sessionSummaries]);

  const attachedMemoryItems = React.useMemo(() => {
    if (!activeProject) return [];
    const attached = new Set(activeProject.memoryIds);
    return memoryItems.filter((item) => attached.has(item.id));
  }, [activeProject, memoryItems]);

  const availableMemoryItems = React.useMemo(() => {
    if (!activeProject) return [];
    const attached = new Set(activeProject.memoryIds);
    return memoryItems.filter((item) => !attached.has(item.id));
  }, [activeProject, memoryItems]);

  const arenaBranchCatalog = React.useMemo(
    () => memberSessions.flatMap((session) => buildProjectArenaBranchEntries(session)),
    [memberSessions],
  );

  React.useEffect(() => {
    const availableIds = memberSessions.map((session) => session.id);
    setArenaSessionIds((prev) => {
      const filtered = prev.filter((sessionId) => availableIds.includes(sessionId));
      if (filtered.length >= 2 || memberSessions.length < 2) {
        return filtered;
      }
      return availableIds.slice(0, Math.min(2, availableIds.length));
    });
  }, [memberSessions]);

  React.useEffect(() => {
    const availableKeys = arenaBranchCatalog.map((entry) => entry.key);
    setArenaBranchKeys((prev) => {
      const filtered = prev.filter((key) => availableKeys.includes(key));
      if (filtered.length >= 2 || arenaBranchCatalog.length < 2) {
        return filtered;
      }
      return availableKeys.slice(0, Math.min(2, availableKeys.length));
    });
  }, [arenaBranchCatalog]);

  const toggleArenaSession = React.useCallback((sessionId: string) => {
    setArenaSessionIds((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((entry) => entry !== sessionId);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, sessionId];
    });
  }, []);

  const toggleArenaBranch = React.useCallback((branchKey: string) => {
    setArenaBranchKeys((prev) => {
      if (prev.includes(branchKey)) {
        return prev.filter((entry) => entry !== branchKey);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, branchKey];
    });
  }, []);

  const aggregateStats = React.useMemo(() => {
    const transcriptBlocks = memberSessions.map((session) => {
      const normalizedMessages = normalizeMessages(
        session.snapshot.messages.map((entry) => entry.message),
      );
      const transcript = toPlainTextTranscript(normalizedMessages);
      return `[${formatSessionTitle(session.title)}]\n${transcript}`.trim();
    });
    const aggregateText = [
      activeProject?.title?.trim() ? `Project: ${activeProject.title.trim()}` : "",
      globalContextDraft.trim() ? `Global context:\n${globalContextDraft.trim()}` : "",
      ...transcriptBlocks,
    ]
      .filter((value) => value.length > 0)
      .join("\n\n");
    const bytes = encoder.encode(aggregateText).length;
    const messageCount = memberSessions.reduce((total, session) => total + session.snapshot.messages.length, 0);
    const artifactCount = memberSessions.reduce((total, session) => total + session.artifacts.length, 0);
    return {
      artifactCount,
      bytes,
      estimatedTokens: estimateTokenCount(aggregateText),
      messageCount,
      text: aggregateText,
    };
  }, [activeProject?.title, globalContextDraft, memberSessions]);

  const projectView = React.useMemo(() => {
    if (!activeProject) return null;
    return {
      ...activeProject,
      globalContext: globalContextDraft,
      title: titleDraft.trim() || null,
    };
  }, [activeProject, globalContextDraft, titleDraft]);

  const arenaSessionEntries = React.useMemo(
    () =>
      memberSessions
        .filter((session) => arenaSessionIds.includes(session.id))
        .map((session) => buildProjectArenaSessionEntry(session)),
    [arenaSessionIds, memberSessions],
  );

  const arenaBranchEntries = React.useMemo(
    () => arenaBranchCatalog.filter((entry) => arenaBranchKeys.includes(entry.key)),
    [arenaBranchCatalog, arenaBranchKeys],
  );

  const arenaEntries = React.useMemo<ProjectArenaEntry[]>(
    () => (arenaCompareMode === "sessions" ? arenaSessionEntries : arenaBranchEntries),
    [arenaBranchEntries, arenaCompareMode, arenaSessionEntries],
  );

  const arenaSummary = React.useMemo(
    () => buildProjectArenaSummary(arenaEntries, globalContextDraft, attachedMemoryItems),
    [arenaEntries, attachedMemoryItems, globalContextDraft],
  );

  const selectedMergeMemory = React.useMemo(() => {
    if (!selectedCanvasItem || selectedCanvasItem.kind !== "node") return null;
    if (selectedCanvasItem.memoryType !== "merge" || !selectedCanvasItem.memoryId) return null;
    return attachedMemoryItems.find((item) => item.id === selectedCanvasItem.memoryId) ?? null;
  }, [attachedMemoryItems, selectedCanvasItem]);

  React.useEffect(() => {
    if (!arenaSummary) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    setMemoryTitleDraft((current) =>
      current === "Arena synthesis" || current.trim().length === 0
        ? `${leadEntry.title} synthesis`
        : current,
    );
  }, [arenaEntries, arenaSummary]);

  const handleAppendArenaSummary = React.useCallback(() => {
    if (!arenaSummary) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      return trimmed.length > 0 ? `${trimmed}\n\n${arenaSummary.note}` : arenaSummary.note;
    });
    setWorkspaceMode("canvas");
  }, [arenaSummary]);

  const handlePromoteArenaWinner = React.useCallback(async () => {
    if (!arenaSummary) return;
    if (arenaSummary.kind === "branch") {
      const leadEntry = arenaEntries.find((entry): entry is ProjectArenaBranchEntry => entry.key === arenaSummary.leadKey && entry.kind === "branch");
      if (!leadEntry) return;
      await saveActiveProjectPatch({
        arenaWinnerBranchKey: leadEntry.key,
        arenaWinnerSessionId: leadEntry.sessionId,
      });
      return;
    }
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    await saveActiveProjectPatch({
      arenaWinnerBranchKey: null,
      arenaWinnerSessionId: leadEntry.sessionId,
    });
  }, [arenaEntries, arenaSummary, saveActiveProjectPatch]);

  const handleSaveArenaSummaryAsMemory = React.useCallback(async () => {
    if (!activeProject || !arenaSummary) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    setMemoryActionState("saving");
    try {
      const item = await createMemoryItem({
        content: arenaSummary.note,
        sourceProjectId: activeProject.id,
        sourceKeys: arenaEntries.map((entry) => entry.key),
        sourceKind: arenaSummary.kind,
        sourceSessionId: leadEntry.sessionId,
        title: formatMemoryTitle(memoryTitleDraft),
        type: memoryTypeDraft,
      });
      await saveActiveProjectPatch({
        memoryIds: [...new Set([...activeProject.memoryIds, item.id])],
      });
      setMemoryActionState("saved");
    } catch {
      setMemoryActionState("error");
    }
  }, [
    activeProject,
    arenaSummary,
    createMemoryItem,
    arenaEntries,
    memoryTitleDraft,
    memoryTypeDraft,
    saveActiveProjectPatch,
  ]);

  const handleCreateArenaMergeNode = React.useCallback(async () => {
    if (!activeProject || !arenaSummary) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    setMemoryActionState("saving");
    try {
      const mergeTitle = `${leadEntry.title} merge node`;
      const item = await createMemoryItem({
        content: arenaSummary.note,
        sourceProjectId: activeProject.id,
        sourceKeys: arenaEntries.map((entry) => entry.key),
        sourceKind: arenaSummary.kind,
        sourceSessionId: leadEntry.sessionId,
        title: mergeTitle,
        type: "merge",
      });
      await saveActiveProjectPatch({
        memoryIds: [...new Set([...activeProject.memoryIds, item.id])],
      });
      setMemoryTitleDraft(mergeTitle);
      setMemoryActionState("saved");
      setWorkspaceMode("canvas");
    } catch {
      setMemoryActionState("error");
    }
  }, [activeProject, arenaEntries, arenaSummary, createMemoryItem, saveActiveProjectPatch]);

  const handleAttachMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    await saveActiveProjectPatch({
      memoryIds: [...new Set([...activeProject.memoryIds, memoryId])],
    });
  }, [activeProject, saveActiveProjectPatch]);

  const handleDetachMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    await saveActiveProjectPatch({
      memoryIds: activeProject.memoryIds.filter((entry) => entry !== memoryId),
    });
  }, [activeProject, saveActiveProjectPatch]);

  const handleDeleteMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    await deleteMemoryItem(memoryId);
    await saveActiveProjectPatch({
      memoryIds: activeProject.memoryIds.filter((entry) => entry !== memoryId),
    });
  }, [activeProject, deleteMemoryItem, saveActiveProjectPatch]);

  const handleReplaceGlobalContextWithMerge = React.useCallback(() => {
    const mergeContent = selectedMergeMemory?.content.trim() ?? selectedCanvasItem?.preview.trim() ?? "";
    if (!mergeContent) return;
    setGlobalContextDraft(mergeContent);
  }, [selectedCanvasItem?.preview, selectedMergeMemory]);

  const handleAppendMergeToGlobalContext = React.useCallback(() => {
    const mergeContent = selectedMergeMemory?.content.trim() ?? selectedCanvasItem?.preview.trim() ?? "";
    if (!mergeContent) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return mergeContent;
      if (trimmed.includes(mergeContent)) return trimmed;
      return `${trimmed}\n\n${mergeContent}`;
    });
  }, [selectedCanvasItem?.preview, selectedMergeMemory]);

  if (!activeProject || !projectView) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/60 bg-muted/20 px-4 py-4">
        <SectionCard
          title="Project Overview"
          description="Projects aggregate multiple saved sessions into one persistent canvas."
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Project title
              </label>
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.currentTarget.value)}
                onBlur={() => {
                  void handleCommitTitle();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCommitTitle();
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Name this project"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Sessions</div>
                <div className="mt-1 font-semibold text-foreground">{activeProject.sessionIds.length}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Messages</div>
                <div className="mt-1 font-semibold text-foreground">{aggregateStats.messageCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Artifacts</div>
                <div className="mt-1 font-semibold text-foreground">{aggregateStats.artifactCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Footprint</div>
                <div className="mt-1 font-semibold text-foreground">{formatBytes(aggregateStats.bytes)}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Memory</div>
                <div className="mt-1 font-semibold text-foreground">{attachedMemoryItems.length}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Winner</div>
                <div className="mt-1 font-semibold text-foreground">
                  {formatProjectWinnerLabel({
                    branchCatalog: arenaBranchCatalog,
                    memberSessions,
                    project: activeProject,
                  })}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Aggregate context</div>
              <div className="mt-1 font-semibold text-foreground">{aggregateStats.estimatedTokens} estimated tokens</div>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the combined footprint of the project title, global context, and all included session transcripts.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Global Context"
          description="Shared guidance that applies across every session inside this project."
        >
          <div className="space-y-2">
            <textarea
              value={globalContextDraft}
              onChange={(event) => setGlobalContextDraft(event.currentTarget.value)}
              placeholder="Describe the cross-session goal, constraints, or synthesis notes for this project..."
              className="min-h-[180px] w-full rounded-xl border border-border/70 bg-background px-3 py-3 text-sm leading-6 text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {contextSaveState === "saving"
                  ? "Saving..."
                  : contextSaveState === "saved"
                    ? "Saved"
                    : contextSaveState === "error"
                      ? "Save failed"
                      : "Autosaves after edits"}
              </span>
              <span>{formatBytes(encoder.encode(globalContextDraft).length)}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Project Sessions"
          description="These saved sessions feed the combined project canvas."
        >
          <div className="space-y-2">
            {loadingMembers ? (
              <p className="text-sm text-muted-foreground">Loading member sessions...</p>
            ) : null}
            {memberError ? <p className="text-sm text-rose-700">{memberError}</p> : null}
            {!loadingMembers && memberSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">This project does not include any sessions yet.</p>
            ) : null}
            {memberSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {formatSessionTitle(session.title)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.snapshot.messages.length} messages · {session.artifacts.length} artifacts · updated {formatUpdatedAt(session.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => handleOpenSession(session.id)}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-rose-700"
                      onClick={() => {
                        void handleRemoveSession(session.id);
                      }}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Project Arena"
          description="Compare whole sessions or concrete root branches side by side and synthesize a lead direction."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={workspaceMode === "canvas" ? "default" : "outline"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setWorkspaceMode("canvas")}
              >
                <Network className="h-3.5 w-3.5" />
                Canvas
              </Button>
              <Button
                type="button"
                variant={workspaceMode === "arena" ? "default" : "outline"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setWorkspaceMode("arena")}
                disabled={(arenaCompareMode === "sessions" ? arenaSessionIds.length : arenaBranchKeys.length) < 2}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Arena
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={arenaCompareMode === "sessions" ? "default" : "outline"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setArenaCompareMode("sessions")}
              >
                Sessions
              </Button>
              <Button
                type="button"
                variant={arenaCompareMode === "branches" ? "default" : "outline"}
                size="sm"
                className="h-8 px-3"
                onClick={() => setArenaCompareMode("branches")}
                disabled={arenaBranchCatalog.length < 2}
              >
                Branches
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-sm">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Selection</div>
              <div className="mt-1 font-semibold text-foreground">
                {arenaCompareMode === "sessions" ? arenaSessionIds.length : arenaBranchKeys.length} / 4 {arenaCompareMode} selected
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Arena becomes available once you select at least two {arenaCompareMode === "sessions" ? "project sessions" : "root branches"}.
              </p>
            </div>

            <div className="space-y-2">
              {arenaCompareMode === "sessions"
                ? memberSessions.map((session) => {
                    const selected = arenaSessionIds.includes(session.id);
                    const disabled = !selected && arenaSessionIds.length >= 4;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleArenaSession(session.id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-sky-500/35 bg-sky-500/10"
                            : "border-border/60 bg-background/80 hover:bg-muted/40"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {formatSessionTitle(session.title)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {session.snapshot.messages.length} messages · {session.artifacts.length} artifacts
                          </p>
                        </div>
                        {selected ? (
                          <span className="rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-700">
                            selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : arenaBranchCatalog.map((branch) => {
                    const selected = arenaBranchKeys.includes(branch.key);
                    const disabled = !selected && arenaBranchKeys.length >= 4;
                    return (
                      <button
                        key={branch.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleArenaBranch(branch.key)}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-sky-500/35 bg-sky-500/10"
                            : "border-border/60 bg-background/80 hover:bg-muted/40"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{branch.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {branch.descriptor} · source {branch.sessionTitle}
                          </p>
                        </div>
                        {selected ? (
                          <span className="rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-700">
                            selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
            </div>

            {arenaSummary ? (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-3">
                <div className="flex items-center gap-2 text-violet-700">
                  <GitBranchPlus className="h-4 w-4" />
                  <p className="text-sm font-semibold">Lead candidate ready</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/85">{arenaSummary.summary}</p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Reusable Memory"
          description="Promote winning syntheses into reusable typed notes and attach library items back into this project."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Memory title
                </label>
                <Input
                  aria-label="Memory title"
                  value={memoryTitleDraft}
                  onChange={(event) => setMemoryTitleDraft(event.currentTarget.value)}
                  placeholder="Name this reusable memory"
                />
              </div>
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Memory type
                </label>
                <select
                  aria-label="Memory type"
                  value={memoryTypeDraft}
                  onChange={(event) => setMemoryTypeDraft(event.currentTarget.value as ProjectMemoryType)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {PROJECT_MEMORY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatMemoryTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleSaveArenaSummaryAsMemory();
                  }}
                  disabled={!arenaSummary}
                >
                  <BookCopy className="h-3.5 w-3.5" />
                  Save arena synthesis
                </Button>
                <span className="text-xs text-muted-foreground">
                  {memoryActionState === "saving"
                    ? "Saving memory..."
                    : memoryActionState === "saved"
                      ? "Memory saved"
                      : memoryActionState === "error"
                        ? "Memory save failed"
                        : "Creates a typed memory item and attaches it to this project"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Attached Memory
              </p>
              {!isMemoryReady ? (
                <p className="text-sm text-muted-foreground">Loading memory library...</p>
              ) : attachedMemoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reusable memory attached to this project yet.</p>
              ) : (
                attachedMemoryItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-violet-700">
                            {formatMemoryTypeLabel(item.type)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {item.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            void handleDetachMemory(item.id);
                          }}
                        >
                          Detach
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-rose-700"
                          onClick={() => {
                            void handleDeleteMemory(item.id);
                          }}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Memory Library
              </p>
              {availableMemoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every reusable memory item is already attached.</p>
              ) : (
                availableMemoryItems.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {formatMemoryTypeLabel(item.type)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.content}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        void handleAttachMemory(item.id);
                      }}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Attach
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Add More Sessions"
          description="Pull more saved sessions into the same global project canvas."
        >
          <div className="space-y-2">
            {availableSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every saved session is already inside this project.
              </p>
            ) : null}
            {availableSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatSessionTitle(session.title)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.messageCount} messages · updated {formatUpdatedAt(session.updatedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => {
                    void handleAddSession(session.id);
                  }}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Canvas Focus"
          description="Inspect what you last selected on the aggregated project canvas."
        >
          {selectedCanvasItem ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {selectedCanvasItem.kind}
                </span>
                {"role" in selectedCanvasItem ? (
                  <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {selectedCanvasItem.role}
                  </span>
                ) : null}
                {"memoryType" in selectedCanvasItem && selectedCanvasItem.memoryType ? (
                  <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-violet-700">
                    {selectedCanvasItem.memoryType}
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium text-foreground">{selectedCanvasItem.label}</p>
              {"sessionTitle" in selectedCanvasItem && selectedCanvasItem.sessionTitle ? (
                <p className="text-xs text-muted-foreground">
                  Source session: {selectedCanvasItem.sessionTitle}
                </p>
              ) : null}
              <p className="text-sm leading-6 text-foreground/85">{selectedCanvasItem.preview}</p>
              {selectedMergeMemory ? (
                <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
                    Merge node actions
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Apply this merge synthesis directly into the project&apos;s global context or append it as an additional working note.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleReplaceGlobalContextWithMerge}
                    >
                      Use as global context
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAppendMergeToGlobalContext}
                    >
                      Append to global context
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedCanvasItem.sessionId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenSession(selectedCanvasItem.sessionId!)}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Open source session
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click a node or branch in the canvas to inspect it here.
            </p>
          )}
        </SectionCard>
      </div>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{formatProjectTitle(projectView.title)}</p>
              <p className="text-xs text-muted-foreground">
                {workspaceMode === "canvas"
                  ? `Unified canvas for ${memberSessions.length} session${memberSessions.length === 1 ? "" : "s"} and one shared project context node.`
                  : `Arena comparison across ${arenaEntries.length} selected ${arenaCompareMode === "sessions" ? `session${arenaEntries.length === 1 ? "" : "s"}` : `branch${arenaEntries.length === 1 ? "" : "es"}`}.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={workspaceMode === "canvas" ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkspaceMode("canvas")}
              >
                Canvas
              </Button>
              <Button
                type="button"
                variant={workspaceMode === "arena" ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkspaceMode("arena")}
                disabled={(arenaCompareMode === "sessions" ? arenaSessionIds.length : arenaBranchKeys.length) < 2}
              >
                Arena
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearActiveProject}>
                Exit project
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {workspaceMode === "canvas" ? (
              <ProjectCanvas
                project={projectView}
                sessions={memberSessions}
                memoryItems={attachedMemoryItems}
                onSelectionChange={setSelectedCanvasItem}
              />
            ) : (
              <ProjectArena
                compareMode={arenaCompareMode === "sessions" ? "session" : "branch"}
                entries={arenaEntries}
                summary={arenaSummary}
                onAppendSummary={handleAppendArenaSummary}
                onCreateMergeNode={() => {
                  void handleCreateArenaMergeNode();
                }}
                onOpenSession={handleOpenSession}
                onPromoteLead={() => {
                  void handlePromoteArenaWinner();
                }}
                onSaveSummaryToMemory={() => {
                  void handleSaveArenaSummaryAsMemory();
                }}
                winnerKey={
                  arenaCompareMode === "branches"
                    ? activeProject.arenaWinnerBranchKey
                    : activeProject.arenaWinnerSessionId
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
