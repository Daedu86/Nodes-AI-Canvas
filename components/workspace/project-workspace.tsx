"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { ArrowUpRight, BarChart3, BookCopy, GitBranchPlus, Network, PlusIcon, Trash2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useProjects } from "@/components/context/projects";
import { useReusableMemory } from "@/components/context/reusable-memory";
import { estimateTokenCount, formatBytes } from "@/lib/context-budget";
import { normalizeMessages, toPlainTextTranscript } from "@/lib/llm/messages";
import type { ProjectMemorySourceKind, ProjectMemoryType } from "@/lib/memory-documents";
import type { ProjectCollaboratorRole } from "@/lib/project-documents";
import {
  PROJECT_EDITABLE_MEMORY_TYPES,
  PROJECT_MEMORY_META,
  PROJECT_MEMORY_TYPE_ORDER,
  formatProjectMemoryTypeLabel,
} from "@/lib/project-memory-meta";
import type { SessionDocument, SessionSummary } from "@/lib/session-documents";
import { ProjectCanvas, type ProjectCanvasSelection } from "@/components/workspace/project-canvas";
import { ProjectArena } from "@/components/workspace/project-arena";
import { ProjectSectionCard } from "@/components/workspace/project-section-card";
import {
  formatMemoryTitle,
  formatProjectTitle,
  formatProjectWinnerLabel,
  formatSessionTitle,
  formatUpdatedAt,
  summarizePreviewText,
  summarizeSelectionForTypedNode,
} from "@/components/workspace/project-workspace-utils";
import {
  PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD,
  type ArenaCompareMode,
  type ProjectInspectorTab,
  useResetProjectWorkspaceState,
} from "@/components/workspace/use-project-workspace-reset";
import {
  buildProjectArenaBranchEntries,
  type ProjectArenaBranchEntry,
  type ProjectArenaEntry,
  buildProjectArenaSessionEntry,
  buildProjectArenaSummary,
} from "@/lib/project-arena";
import {
  buildProjectContextDraft,
  buildProjectContextSources,
  getDefaultProjectContextSourceIds,
  getProjectContextSourceCategoryLabel,
  getProjectContextSourcePreview,
} from "@/lib/project-context-builder";

const encoder = new TextEncoder();
export function ProjectWorkspace() {
  const {
    activeProject,
    clearActiveProject,
    removeActiveProjectMember,
    saveActiveProjectMember,
    saveActiveProjectPatch,
  } = useProjects();
  const { data: session } = useSession();
  const { activeSessionId, sessions: sessionSummaries } = usePersistedSessions();
  const { createMemoryItem, deleteMemoryItem, isReady: isMemoryReady, items: memoryItems } = useReusableMemory();
  const [selectedCanvasItem, setSelectedCanvasItem] = React.useState<ProjectCanvasSelection>(null);
  const globalContextEditorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [titleDraft, setTitleDraft] = React.useState(activeProject?.title ?? "");
  const [globalContextDraft, setGlobalContextDraft] = React.useState(activeProject?.globalContext ?? "");
  const [contextSaveState, setContextSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [workspaceMode, setWorkspaceMode] = React.useState<"canvas" | "arena">(() =>
    (activeProject?.sessionIds.length ?? 0) >= PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD
      ? "arena"
      : "canvas",
  );
  const [arenaCompareMode, setArenaCompareMode] = React.useState<ArenaCompareMode>("sessions");
  const [arenaSessionIds, setArenaSessionIds] = React.useState<string[]>([]);
  const [arenaBranchKeys, setArenaBranchKeys] = React.useState<string[]>([]);
  const [memoryTitleDraft, setMemoryTitleDraft] = React.useState("Arena synthesis");
  const [memoryTypeDraft, setMemoryTypeDraft] = React.useState<ProjectMemoryType>("summary");
  const [memoryContentDraft, setMemoryContentDraft] = React.useState("");
  const [memoryActionState, setMemoryActionState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memoryActionMessage, setMemoryActionMessage] = React.useState("Create a typed node and attach it to this project.");
  const [selectedContextSourceIds, setSelectedContextSourceIds] = React.useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = React.useState<ProjectInspectorTab>("context");
  const [memberEmailDraft, setMemberEmailDraft] = React.useState("");
  const [memberRoleDraft, setMemberRoleDraft] = React.useState<ProjectCollaboratorRole>("viewer");
  const [memberActionState, setMemberActionState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memberActionMessage, setMemberActionMessage] = React.useState("Share this project with editors or viewers.");

  const shouldPreferArenaOnLoad = React.useMemo(
    () => (activeProject?.sessionIds.length ?? 0) >= PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD,
    [activeProject?.sessionIds.length],
  );

  useResetProjectWorkspaceState({
    activeProject,
    setArenaBranchKeys,
    setArenaCompareMode,
    setArenaSessionIds,
    setContextSaveState,
    setGlobalContextDraft,
    setInspectorTab,
    setMemberActionMessage,
    setMemberActionState,
    setMemberEmailDraft,
    setMemberRoleDraft,
    setMemoryActionMessage,
    setMemoryActionState,
    setMemoryContentDraft,
    setMemoryTitleDraft,
    setMemoryTypeDraft,
    setSelectedCanvasItem,
    setSelectedContextSourceIds,
    setTitleDraft,
    setWorkspaceMode,
  });

  const memberSessions = React.useMemo<SessionDocument[]>(
    () => activeProject?.sessions ?? [],
    [activeProject?.sessions],
  );
  const canEditProject = React.useMemo(
    () => activeProject?.accessRole === "owner" || activeProject?.accessRole === "editor",
    [activeProject?.accessRole],
  );
  const canManageProject = React.useMemo(
    () => activeProject?.accessRole === "owner",
    [activeProject?.accessRole],
  );
  const currentUserEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  const focusGlobalContextEditor = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const editor = globalContextEditorRef.current;
      if (!editor) return;
      editor.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
      editor.focus();
      try {
        const cursorPosition = editor.value.length;
        editor.setSelectionRange(cursorPosition, cursorPosition);
      } catch {
        // Ignore selection sync failures in read-only or unsupported environments.
      }
    }, 0);
  }, []);

  React.useEffect(() => {
    if (!activeProject) return;
    if (!canEditProject) return;
    if (globalContextDraft === activeProject.globalContext) return;

    setContextSaveState("saving");
    const timeout = window.setTimeout(() => {
      void saveActiveProjectPatch({ globalContext: globalContextDraft })
        .then(() => setContextSaveState("saved"))
        .catch(() => setContextSaveState("error"));
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [activeProject, canEditProject, globalContextDraft, saveActiveProjectPatch]);

  React.useEffect(() => {
    if (!selectedCanvasItem) return;
    if (selectedCanvasItem.kind === "node" && selectedCanvasItem.role === "global-context") {
      setInspectorTab("context");
      focusGlobalContextEditor();
      return;
    }
    setInspectorTab("focus");
  }, [focusGlobalContextEditor, selectedCanvasItem]);

  const handleCommitTitle = React.useCallback(async () => {
    if (!activeProject) return;
    if (!canEditProject) return;
    const normalizedTitle = titleDraft.trim() || null;
    if ((activeProject.title ?? null) === normalizedTitle) return;
    await saveActiveProjectPatch({ title: normalizedTitle });
  }, [activeProject, canEditProject, saveActiveProjectPatch, titleDraft]);

  const handleOpenSession = React.useCallback((sessionId: string) => {
    clearActiveProject();
    if (typeof window === "undefined") {
      return;
    }
    window.location.assign(`/?sessionId=${encodeURIComponent(sessionId)}`);
  }, [clearActiveProject]);

  const handleExitProject = React.useCallback(() => {
    clearActiveProject();
    const targetSessionId = activeSessionId ?? activeProject?.sessionIds[0] ?? null;
    if (!targetSessionId || typeof window === "undefined") {
      return;
    }
    window.location.assign(`/?sessionId=${encodeURIComponent(targetSessionId)}`);
  }, [activeProject?.sessionIds, activeSessionId, clearActiveProject]);

  const handleAddSession = React.useCallback(async (sessionId: string) => {
    if (!activeProject) return;
    if (!canManageProject) return;
    if (activeProject.sessionIds.includes(sessionId)) return;
    await saveActiveProjectPatch({
      sessionIds: [...activeProject.sessionIds, sessionId],
    });
  }, [activeProject, canManageProject, saveActiveProjectPatch]);

  const handleRemoveSession = React.useCallback(async (sessionId: string) => {
    if (!activeProject) return;
    if (!canManageProject) return;
    const branchWinnerBelongsToRemovedSession =
      typeof activeProject.arenaWinnerBranchKey === "string" &&
      activeProject.arenaWinnerBranchKey.startsWith(`${sessionId}:`);
    await saveActiveProjectPatch({
      arenaWinnerBranchKey: branchWinnerBelongsToRemovedSession ? null : activeProject.arenaWinnerBranchKey,
      arenaWinnerSessionId:
        activeProject.arenaWinnerSessionId === sessionId ? null : activeProject.arenaWinnerSessionId,
      sessionIds: activeProject.sessionIds.filter((entry) => entry !== sessionId),
    });
  }, [activeProject, canManageProject, saveActiveProjectPatch]);

  const availableSessions = React.useMemo(() => {
    if (!activeProject || !canManageProject) return [] satisfies SessionSummary[];
    const included = new Set(activeProject.sessionIds);
    return sessionSummaries.filter((session) => !included.has(session.id));
  }, [activeProject, canManageProject, sessionSummaries]);

  const attachedMemoryItems = React.useMemo(() => {
    if (!activeProject) return [];
    const attached = new Set(activeProject.memoryIds);
    const byId = new Map(
      (activeProject.attachedMemoryItems ?? [])
        .filter((item) => attached.has(item.id))
        .map((item) => [item.id, item] as const),
    );
    memoryItems.forEach((item) => {
      if (attached.has(item.id)) byId.set(item.id, item);
    });
    return [...byId.values()];
  }, [activeProject, memoryItems]);

  const availableMemoryItems = React.useMemo(() => {
    if (!activeProject || !canManageProject) return [];
    const attached = new Set(activeProject.memoryIds);
    return memoryItems.filter((item) => !attached.has(item.id));
  }, [activeProject, canManageProject, memoryItems]);

  const attachedMemoryGroups = React.useMemo(
    () =>
      PROJECT_MEMORY_TYPE_ORDER.map((type) => ({
        items: attachedMemoryItems.filter((item) => item.type === type),
        type,
      })).filter((group) => group.items.length > 0),
    [attachedMemoryItems],
  );

  const availableMemoryGroups = React.useMemo(
    () =>
      PROJECT_MEMORY_TYPE_ORDER.map((type) => ({
        items: availableMemoryItems.filter((item) => item.type === type),
        type,
      })).filter((group) => group.items.length > 0),
    [availableMemoryItems],
  );

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

  const globalContextPreview = React.useMemo(() => {
    const preview = summarizePreviewText(globalContextDraft, 240);
    return preview.length > 0
      ? preview
      : "No shared project guidance yet. Add reusable goals, constraints, or synthesis notes for every attached session.";
  }, [globalContextDraft]);

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

  const selectedMemoryItem = React.useMemo(() => {
    if (!selectedCanvasItem || selectedCanvasItem.kind !== "node" || !selectedCanvasItem.memoryId) {
      return null;
    }
    return attachedMemoryItems.find((item) => item.id === selectedCanvasItem.memoryId) ?? null;
  }, [attachedMemoryItems, selectedCanvasItem]);

  const selectedMergeMemory = React.useMemo(() => {
    if (!selectedCanvasItem || selectedCanvasItem.kind !== "node") return null;
    if (selectedCanvasItem.memoryType !== "merge" || !selectedCanvasItem.memoryId) return null;
    return selectedMemoryItem?.type === "merge" ? selectedMemoryItem : null;
  }, [selectedCanvasItem, selectedMemoryItem]);

  const projectContextSources = React.useMemo(
    () =>
      activeProject
        ? buildProjectContextSources({
            arenaSummary,
            attachedMemoryItems,
            branchCatalog: arenaBranchCatalog,
            project: activeProject,
            selectedFocus: selectedCanvasItem,
            sessions: memberSessions,
          })
        : [],
    [activeProject, arenaBranchCatalog, arenaSummary, attachedMemoryItems, memberSessions, selectedCanvasItem],
  );

  const selectedProjectContextSources = React.useMemo(
    () => projectContextSources.filter((source) => selectedContextSourceIds.includes(source.id)),
    [projectContextSources, selectedContextSourceIds],
  );

  const projectContextBuilderDraft = React.useMemo(
    () => buildProjectContextDraft(selectedProjectContextSources),
    [selectedProjectContextSources],
  );
  const selectedArenaCount = arenaCompareMode === "sessions" ? arenaSessionIds.length : arenaBranchKeys.length;
  const inspectorTabMeta: Record<ProjectInspectorTab, { badge: string; description: string; label: string }> = {
    context: {
      badge: String(selectedProjectContextSources.length),
      description: "Shape the project-wide guidance and compose a cleaner global context from reusable sources.",
      label: "Context",
    },
    arena: {
      badge: `${selectedArenaCount}/4`,
      description: "Pick the sessions or branches that matter, then drive Arena comparisons from one place.",
      label: "Arena",
    },
    nodes: {
      badge: String(attachedMemoryItems.length),
      description: "Create and attach typed nodes that turn conclusions into reusable project structure.",
      label: "Nodes",
    },
    sessions: {
      badge: String(memberSessions.length),
      description: "Curate which saved sessions belong to the project and keep the canvas source set clean.",
      label: "Sessions",
    },
    focus: {
      badge: selectedCanvasItem ? "1" : "0",
      description: "Inspect the last selected canvas node or branch and turn it into context or a typed node.",
      label: "Focus",
    },
  };

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
    if (!canEditProject) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      return trimmed.length > 0 ? `${trimmed}\n\n${arenaSummary.note}` : arenaSummary.note;
    });
    setWorkspaceMode("canvas");
  }, [arenaSummary, canEditProject]);

  const handlePromoteArenaWinner = React.useCallback(async () => {
    if (!arenaSummary) return;
    if (!canEditProject) return;
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
  }, [arenaEntries, arenaSummary, canEditProject, saveActiveProjectPatch]);

  const handleSaveArenaSummaryAsMemory = React.useCallback(async () => {
    if (!activeProject || !arenaSummary) return;
    if (!canManageProject) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    setMemoryActionState("saving");
    setMemoryActionMessage("Saving arena synthesis as a typed node...");
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
      setMemoryContentDraft(arenaSummary.note);
      setMemoryActionMessage("Typed node saved from Arena synthesis.");
    } catch {
      setMemoryActionState("error");
      setMemoryActionMessage("Could not save the Arena synthesis as a typed node.");
    }
  }, [
    activeProject,
    arenaSummary,
    createMemoryItem,
    arenaEntries,
    canManageProject,
    memoryTitleDraft,
    memoryTypeDraft,
    saveActiveProjectPatch,
  ]);

  const handleCreateArenaMergeNode = React.useCallback(async () => {
    if (!activeProject || !arenaSummary) return;
    if (!canManageProject) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    if (!leadEntry) return;
    setMemoryActionState("saving");
    setMemoryActionMessage("Creating merge node from Arena synthesis...");
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
      setMemoryActionMessage("Merge node created and attached to the project.");
      setWorkspaceMode("canvas");
    } catch {
      setMemoryActionState("error");
      setMemoryActionMessage("Could not create the merge node.");
    }
  }, [activeProject, arenaEntries, arenaSummary, canManageProject, createMemoryItem, saveActiveProjectPatch]);

  const handleSeedTypedNodeFromArena = React.useCallback(() => {
    if (!arenaSummary) return;
    const leadEntry = arenaEntries.find((entry) => entry.key === arenaSummary.leadKey);
    setMemoryContentDraft(arenaSummary.note);
    setMemoryTitleDraft((current) => {
      const trimmed = current.trim();
      if (trimmed.length > 0 && trimmed !== "Arena synthesis") return current;
      return leadEntry ? `${leadEntry.title} ${formatProjectMemoryTypeLabel(memoryTypeDraft).toLowerCase()}` : current;
    });
    setMemoryActionState("idle");
    setMemoryActionMessage("Arena synthesis copied into the typed node composer.");
    setInspectorTab("nodes");
  }, [arenaEntries, arenaSummary, memoryTypeDraft]);

  const handleSeedTypedNodeFromCanvasFocus = React.useCallback(() => {
    if (!selectedCanvasItem) return;
    if (!canManageProject) return;
    const summary = summarizeSelectionForTypedNode(selectedCanvasItem);
    if (!summary) return;
    setMemoryContentDraft(summary);
    setMemoryTitleDraft((current) => {
      const trimmed = current.trim();
      if (trimmed.length > 0 && trimmed !== "Arena synthesis") return current;
      return `${selectedCanvasItem.label} ${formatProjectMemoryTypeLabel(memoryTypeDraft).toLowerCase()}`;
    });
    setMemoryActionState("idle");
    setMemoryActionMessage("Canvas focus copied into the typed node composer.");
    setInspectorTab("nodes");
  }, [canManageProject, memoryTypeDraft, selectedCanvasItem]);

  const handleCreateTypedNode = React.useCallback(async () => {
    if (!activeProject) return;
    if (!canManageProject) return;
    const title = formatMemoryTitle(memoryTitleDraft);
    const content = memoryContentDraft.trim();
    if (!title || !content) {
      setMemoryActionState("error");
      setMemoryActionMessage("Typed nodes need both a title and content.");
      return;
    }

    let sourceKind: ProjectMemorySourceKind = null;
    let sourceKeys: string[] = [];
    let sourceSessionId: string | null = null;

    if (selectedCanvasItem?.kind === "node" && selectedCanvasItem.sessionId) {
      sourceSessionId = selectedCanvasItem.sessionId;
      if (selectedCanvasItem.role === "session") {
        sourceKind = "session";
        sourceKeys = [selectedCanvasItem.sessionId];
      } else if (selectedCanvasItem.messageId) {
        sourceKind = "branch";
        sourceKeys = [`${selectedCanvasItem.sessionId}:${selectedCanvasItem.messageId}`];
      }
    }

    setMemoryActionState("saving");
    setMemoryActionMessage("Creating typed node...");
    try {
      const item = await createMemoryItem({
        content,
        sourceProjectId: activeProject.id,
        sourceKeys,
        sourceKind,
        sourceSessionId,
        title,
        type: memoryTypeDraft,
      });
      await saveActiveProjectPatch({
        memoryIds: [...new Set([...activeProject.memoryIds, item.id])],
      });
      setMemoryActionState("saved");
      setMemoryActionMessage(`${formatProjectMemoryTypeLabel(memoryTypeDraft)} node created and attached.`);
      setMemoryTitleDraft(`${formatProjectMemoryTypeLabel(memoryTypeDraft)} note`);
      setMemoryContentDraft("");
      setWorkspaceMode("canvas");
    } catch {
      setMemoryActionState("error");
      setMemoryActionMessage("Could not create the typed node.");
    }
  }, [
    activeProject,
    createMemoryItem,
    canManageProject,
    memoryContentDraft,
    memoryTitleDraft,
    memoryTypeDraft,
    saveActiveProjectPatch,
    selectedCanvasItem,
  ]);

  const handleAttachMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    if (!canManageProject) return;
    await saveActiveProjectPatch({
      memoryIds: [...new Set([...activeProject.memoryIds, memoryId])],
    });
  }, [activeProject, canManageProject, saveActiveProjectPatch]);

  const handleDetachMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    if (!canManageProject) return;
    await saveActiveProjectPatch({
      memoryIds: activeProject.memoryIds.filter((entry) => entry !== memoryId),
    });
  }, [activeProject, canManageProject, saveActiveProjectPatch]);

  const handleDeleteMemory = React.useCallback(async (memoryId: string) => {
    if (!activeProject) return;
    if (!canManageProject) return;
    await deleteMemoryItem(memoryId);
    await saveActiveProjectPatch({
      memoryIds: activeProject.memoryIds.filter((entry) => entry !== memoryId),
    });
  }, [activeProject, canManageProject, deleteMemoryItem, saveActiveProjectPatch]);

  const handleReplaceGlobalContextWithMerge = React.useCallback(() => {
    if (!canEditProject) return;
    const mergeContent = selectedMergeMemory?.content.trim() ?? selectedCanvasItem?.preview.trim() ?? "";
    if (!mergeContent) return;
    setGlobalContextDraft(mergeContent);
    setInspectorTab("context");
  }, [canEditProject, selectedCanvasItem?.preview, selectedMergeMemory]);

  const handleAppendMergeToGlobalContext = React.useCallback(() => {
    if (!canEditProject) return;
    const mergeContent = selectedMergeMemory?.content.trim() ?? selectedCanvasItem?.preview.trim() ?? "";
    if (!mergeContent) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return mergeContent;
      if (trimmed.includes(mergeContent)) return trimmed;
      return `${trimmed}\n\n${mergeContent}`;
    });
    setInspectorTab("context");
  }, [canEditProject, selectedCanvasItem?.preview, selectedMergeMemory]);

  const handleAppendSelectedMemoryToGlobalContext = React.useCallback(() => {
    if (!canEditProject) return;
    const content = selectedMemoryItem?.content.trim() ?? "";
    if (!content) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return content;
      if (trimmed.includes(content)) return trimmed;
      return `${trimmed}\n\n${content}`;
    });
    setInspectorTab("context");
  }, [canEditProject, selectedMemoryItem]);

  const toggleProjectContextSource = React.useCallback((sourceId: string) => {
    setSelectedContextSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((entry) => entry !== sourceId)
        : [...prev, sourceId],
    );
  }, []);

  const handleSelectDefaultContextSources = React.useCallback(() => {
    setSelectedContextSourceIds(getDefaultProjectContextSourceIds(projectContextSources));
  }, [projectContextSources]);

  const handleSelectAllContextSources = React.useCallback(() => {
    setSelectedContextSourceIds(projectContextSources.map((source) => source.id));
  }, [projectContextSources]);

  const handleClearContextSources = React.useCallback(() => {
    setSelectedContextSourceIds([]);
  }, []);

  const handleReplaceGlobalContextWithBuilder = React.useCallback(() => {
    if (!canEditProject) return;
    const nextText = projectContextBuilderDraft.text.trim();
    if (!nextText) return;
    setGlobalContextDraft(nextText);
    setInspectorTab("context");
  }, [canEditProject, projectContextBuilderDraft.text]);

  const handleAppendBuilderToGlobalContext = React.useCallback(() => {
    if (!canEditProject) return;
    const nextText = projectContextBuilderDraft.text.trim();
    if (!nextText) return;
    setGlobalContextDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return nextText;
      if (trimmed.includes(nextText)) return trimmed;
      return `${trimmed}\n\n${nextText}`;
    });
    setInspectorTab("context");
  }, [canEditProject, projectContextBuilderDraft.text]);

  const handleEditGlobalContext = React.useCallback(() => {
    setInspectorTab("context");
    focusGlobalContextEditor();
  }, [focusGlobalContextEditor]);

  const handleSaveProjectMember = React.useCallback(async () => {
    if (!activeProject || !canManageProject) return;
    const email = memberEmailDraft.trim().toLowerCase();
    if (!email) {
      setMemberActionState("error");
      setMemberActionMessage("Enter an email before sharing the project.");
      return;
    }
    if (currentUserEmail && email === currentUserEmail) {
      setMemberActionState("error");
      setMemberActionMessage("You already own this project.");
      return;
    }

    setMemberActionState("saving");
    setMemberActionMessage(`Adding ${email} as ${memberRoleDraft}...`);
    try {
      await saveActiveProjectMember({ email, role: memberRoleDraft });
      setMemberEmailDraft("");
      setMemberActionState("saved");
      setMemberActionMessage(`Project shared with ${email}.`);
    } catch {
      setMemberActionState("error");
      setMemberActionMessage("Could not update project members.");
    }
  }, [
    activeProject,
    canManageProject,
    currentUserEmail,
    memberEmailDraft,
    memberRoleDraft,
    saveActiveProjectMember,
  ]);

  const handleRemoveProjectMember = React.useCallback(async (email: string) => {
    if (!canManageProject) return;
    setMemberActionState("saving");
    setMemberActionMessage(`Removing ${email}...`);
    try {
      await removeActiveProjectMember(email);
      setMemberActionState("saved");
      setMemberActionMessage(`${email} removed from the project.`);
    } catch {
      setMemberActionState("error");
      setMemberActionMessage("Could not remove that project member.");
    }
  }, [canManageProject, removeActiveProjectMember]);

  const handleChangeProjectMemberRole = React.useCallback(async (email: string, role: ProjectCollaboratorRole) => {
    if (!canManageProject) return;
    setMemberActionState("saving");
    setMemberActionMessage(`Updating ${email} to ${role}...`);
    try {
      await saveActiveProjectMember({ email, role });
      setMemberActionState("saved");
      setMemberActionMessage(`${email} is now ${role}.`);
    } catch {
      setMemberActionState("error");
      setMemberActionMessage("Could not update that project member.");
    }
  }, [canManageProject, saveActiveProjectMember]);

  if (!activeProject || !projectView) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/60 bg-muted/20 px-4 py-4">
        <ProjectSectionCard
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
                disabled={!canEditProject}
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
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Shared context
                  </div>
                  <p className="mt-1 text-sm leading-6 text-foreground/85">
                    {globalContextPreview}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-3"
                  onClick={handleEditGlobalContext}
                >
                  {canEditProject ? "Edit context" : "View context"}
                </Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Reusable guidance that flows into every session attached to this project.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Access</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {activeProject.accessRole === "owner"
                      ? "Owner"
                      : activeProject.accessRole === "editor"
                        ? "Editor"
                        : "Viewer"}
                  </div>
                </div>
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {activeProject.members.length + 1} collaborator{activeProject.members.length === 0 ? "" : "s"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Editors can update project context and arena winners. Owners still control attached sessions, typed nodes, and sharing.
              </p>
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
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Collaboration
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Share this project with specific people. Collaboration stays scoped to this project only.
                  </p>
                </div>
                {canManageProject ? (
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-700">
                    Owner controls sharing
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {activeProject.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No collaborators added yet.</p>
                ) : (
                  activeProject.members.map((member) => (
                    <div
                      key={member.email}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{member.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.role} · added {formatUpdatedAt(member.addedAt)}
                        </p>
                      </div>
                      {canManageProject ? (
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Project role for ${member.email}`}
                            value={member.role}
                            onChange={(event) => {
                              void handleChangeProjectMemberRole(
                                member.email,
                                event.currentTarget.value as ProjectCollaboratorRole,
                              );
                            }}
                            className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="viewer">viewer</option>
                            <option value="editor">editor</option>
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-rose-700"
                            onClick={() => {
                              void handleRemoveProjectMember(member.email);
                            }}
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              {canManageProject ? (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      aria-label="Project member email"
                      value={memberEmailDraft}
                      onChange={(event) => setMemberEmailDraft(event.currentTarget.value)}
                      placeholder="person@example.com"
                    />
                    <select
                      aria-label="New member role"
                      value={memberRoleDraft}
                      onChange={(event) => setMemberRoleDraft(event.currentTarget.value as ProjectCollaboratorRole)}
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-3"
                      onClick={() => {
                        void handleSaveProjectMember();
                      }}
                    >
                      Share
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span
                      className={
                        memberActionState === "error"
                          ? "text-rose-700"
                          : memberActionState === "saved"
                            ? "text-emerald-700"
                            : memberActionState === "saving"
                              ? "text-sky-700"
                              : "text-muted-foreground"
                      }
                    >
                      {memberActionMessage}
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </ProjectSectionCard>

        <section className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["context", BookCopy],
              ["arena", BarChart3],
              ["nodes", GitBranchPlus],
              ["sessions", Network],
              ["focus", ArrowUpRight],
            ] as const).map(([tab, Icon]) => {
              const meta = inspectorTabMeta[tab];
              const active = inspectorTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-label={`Open ${meta.label}`}
                  onClick={() => setInspectorTab(tab)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-sky-500/35 bg-sky-500/10 shadow-sm"
                      : "border-border/60 bg-background/90 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${active ? "text-sky-700" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${active ? "text-sky-900" : "text-foreground"}`}>
                        {meta.label}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        active ? "bg-sky-500/15 text-sky-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {meta.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
            {inspectorTabMeta[inspectorTab].description}
          </p>
        </section>

        {inspectorTab === "context" ? (
        <ProjectSectionCard
          title="Global Context"
          description="Shared guidance that applies across every session inside this project."
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="project-global-context"
                  className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Shared narrative
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {canEditProject ? "Editable across the whole project" : "Read-only in viewer mode"}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Add durable goals, constraints, terminology, or synthesis notes that should apply across every session in this project.
              </p>
            </div>
            <textarea
              id="project-global-context"
              ref={globalContextEditorRef}
              value={globalContextDraft}
              readOnly={!canEditProject}
              onChange={(event) => setGlobalContextDraft(event.currentTarget.value)}
              placeholder="Describe the cross-session goal, constraints, or synthesis notes for this project..."
              className="min-h-[180px] w-full rounded-xl border border-border/70 bg-background px-3 py-3 text-sm leading-6 text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {!canEditProject
                  ? "Read-only in viewer mode"
                  : contextSaveState === "saving"
                  ? "Saving..."
                  : contextSaveState === "saved"
                    ? "Saved"
                      : contextSaveState === "error"
                        ? "Save failed"
                      : "Autosaves after edits"}
              </span>
              <span>{formatBytes(encoder.encode(globalContextDraft).length)}</span>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Context Builder
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Compose project-wide guidance from Arena synthesis, winners, typed nodes, canvas focus, and member session summaries.
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{selectedProjectContextSources.length} selected</div>
                  <div>{projectContextBuilderDraft.estimatedTokens} tokens</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleSelectDefaultContextSources}
                  disabled={projectContextSources.length === 0}
                >
                  Select defaults
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleSelectAllContextSources}
                  disabled={projectContextSources.length === 0}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleClearContextSources}
                  disabled={selectedContextSourceIds.length === 0}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleReplaceGlobalContextWithBuilder}
                  disabled={!canEditProject || projectContextBuilderDraft.text.trim().length === 0}
                >
                  Replace with builder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleAppendBuilderToGlobalContext}
                  disabled={!canEditProject || projectContextBuilderDraft.text.trim().length === 0}
                >
                  Append builder
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {projectContextSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add sessions, select canvas context, or attach typed nodes to unlock builder blocks.
                  </p>
                ) : (
                  projectContextSources.map((source) => {
                    const selected = selectedContextSourceIds.includes(source.id);
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => toggleProjectContextSource(source.id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-sky-500/35 bg-sky-500/10"
                            : "border-border/60 bg-background/80 hover:bg-muted/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {getProjectContextSourceCategoryLabel(source.category)}
                            </span>
                            <p className="truncate text-sm font-medium text-foreground">{source.title}</p>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {getProjectContextSourcePreview(source)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                          <div>{source.estimatedTokens} tok</div>
                          <div>{formatBytes(source.bytes)}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Builder preview
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {formatBytes(projectContextBuilderDraft.bytes)}
                  </span>
                </div>
                <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-foreground/85">
                  {projectContextBuilderDraft.text.trim() || "Select one or more sources to preview the composed project context."}
                </pre>
              </div>
            </div>
          </div>
        </ProjectSectionCard>
        ) : null}

        {inspectorTab === "sessions" ? (
        <ProjectSectionCard
          title="Project Sessions"
          description="These saved sessions feed the combined project canvas."
        >
          <div className="space-y-2">
            {memberSessions.length === 0 ? (
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
                      disabled={!canManageProject}
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
                      disabled={!canManageProject}
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
        </ProjectSectionCard>
        ) : null}

        {inspectorTab === "arena" ? (
        <ProjectSectionCard
          title="Project Arena"
          description="Compare whole sessions or concrete root branches side by side and synthesize a lead direction."
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Workspace mode</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {workspaceMode === "canvas" ? "Canvas active" : "Arena active"}
                  </div>
                </div>
                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Switch in header
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Use the main workspace header to move between Canvas and Arena. This panel only controls what enters the comparison.
              </p>
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
                {selectedArenaCount} / 4 {arenaCompareMode} selected
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
        </ProjectSectionCard>
        ) : null}

        {inspectorTab === "nodes" ? (
        <ProjectSectionCard
          title="Typed Nodes"
          description="Create question, draft, critique, decision, summary, and evidence nodes that live on the project canvas."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Node title
                </label>
                <Input
                  aria-label="Typed node title"
                  value={memoryTitleDraft}
                  onChange={(event) => setMemoryTitleDraft(event.currentTarget.value)}
                  placeholder="Name this typed node"
                />
              </div>
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Node type
                </label>
                <select
                  aria-label="Typed node type"
                  value={memoryTypeDraft}
                  onChange={(event) => setMemoryTypeDraft(event.currentTarget.value as ProjectMemoryType)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {PROJECT_EDITABLE_MEMORY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatProjectMemoryTypeLabel(type)}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  {PROJECT_MEMORY_META[memoryTypeDraft].description}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Node content
                </label>
                <textarea
                  aria-label="Typed node content"
                  value={memoryContentDraft}
                  onChange={(event) => setMemoryContentDraft(event.currentTarget.value)}
                  placeholder="Write the structured note you want to keep on the project canvas..."
                  className="min-h-[140px] w-full rounded-xl border border-border/70 bg-background px-3 py-3 text-sm leading-6 text-foreground shadow-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{estimateTokenCount(memoryContentDraft)} estimated tokens</span>
                  <span>{formatBytes(encoder.encode(memoryContentDraft).length)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleCreateTypedNode();
                  }}
                  disabled={!canManageProject || memoryTitleDraft.trim().length === 0 || memoryContentDraft.trim().length === 0}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Create typed node
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSeedTypedNodeFromArena}
                  disabled={!canManageProject || !arenaSummary}
                >
                  <GitBranchPlus className="h-3.5 w-3.5" />
                  Use arena synthesis
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSeedTypedNodeFromCanvasFocus}
                  disabled={!canManageProject || !selectedCanvasItem}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Use canvas focus
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleSaveArenaSummaryAsMemory();
                  }}
                  disabled={!canManageProject || !arenaSummary}
                >
                  <BookCopy className="h-3.5 w-3.5" />
                  Save arena synthesis
                </Button>
                <span className="text-xs text-muted-foreground">
                  <span
                    className={
                      memoryActionState === "error"
                        ? "text-rose-700"
                        : memoryActionState === "saved"
                          ? "text-emerald-700"
                          : memoryActionState === "saving"
                            ? "text-sky-700"
                            : "text-muted-foreground"
                    }
                  >
                    {memoryActionMessage}
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Attached Typed Nodes
              </p>
              {!isMemoryReady ? (
                <p className="text-sm text-muted-foreground">Loading memory library...</p>
              ) : !canManageProject ? (
                <p className="text-sm text-muted-foreground">
                  Only the project owner can curate typed nodes and reusable memory in this first collaboration pass.
                </p>
              ) : attachedMemoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No typed nodes attached to this project yet.</p>
              ) : (
                attachedMemoryGroups.map((group) => (
                  <div key={group.type} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                        style={{
                          borderColor: `${PROJECT_MEMORY_META[group.type].accent}55`,
                          color: PROJECT_MEMORY_META[group.type].accent,
                        }}
                      >
                        {formatProjectMemoryTypeLabel(group.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.items.length} node{group.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                              <span
                                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                                style={{
                                  borderColor: `${PROJECT_MEMORY_META[item.type].accent}55`,
                                  color: PROJECT_MEMORY_META[item.type].accent,
                                }}
                              >
                                {formatProjectMemoryTypeLabel(item.type)}
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
                              disabled={!canManageProject}
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
                              disabled={!canManageProject}
                              onClick={() => {
                                void handleDeleteMemory(item.id);
                              }}
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Memory Library
              </p>
              {!canManageProject ? (
                <p className="text-sm text-muted-foreground">
                  Only the owner can attach or detach items from the shared memory library right now.
                </p>
              ) : availableMemoryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every reusable memory item is already attached.</p>
              ) : (
                availableMemoryGroups.slice(0, 6).map((group) => (
                  <div key={group.type} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
                        style={{
                          borderColor: `${PROJECT_MEMORY_META[group.type].accent}55`,
                          color: PROJECT_MEMORY_META[group.type].accent,
                        }}
                      >
                        {formatProjectMemoryTypeLabel(group.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.items.length} available
                      </span>
                    </div>
                    {group.items.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {formatProjectMemoryTypeLabel(item.type)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.content}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          disabled={!canManageProject}
                          onClick={() => {
                            void handleAttachMemory(item.id);
                          }}
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                          Attach
                        </Button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </ProjectSectionCard>
        ) : null}

        {inspectorTab === "sessions" ? (
        <ProjectSectionCard
          title="Add More Sessions"
          description="Pull more saved sessions into the same global project canvas."
        >
          <div className="space-y-2">
            {!canManageProject ? (
              <p className="text-sm text-muted-foreground">
                Only the project owner can change which saved sessions feed this shared canvas.
              </p>
            ) : availableSessions.length === 0 ? (
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
                  disabled={!canManageProject}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        </ProjectSectionCard>
        ) : null}

        {inspectorTab === "focus" ? (
        <ProjectSectionCard
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
              {!selectedMemoryItem ? (
                <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700">
                    Typed node action
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Seed the typed node composer with this canvas focus so you can turn it into a reusable question, draft, critique, decision, summary, or evidence node.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canManageProject}
                    onClick={handleSeedTypedNodeFromCanvasFocus}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Create typed node from focus
                  </Button>
                </div>
              ) : null}
              {selectedMemoryItem && !selectedMergeMemory ? (
                <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-700">
                    Typed node actions
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Append this typed node to the project&apos;s global context when it should influence the whole workspace.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canEditProject}
                    onClick={handleAppendSelectedMemoryToGlobalContext}
                  >
                    Append to global context
                  </Button>
                </div>
              ) : null}
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
                      disabled={!canEditProject}
                      onClick={handleReplaceGlobalContextWithMerge}
                    >
                      Use as global context
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEditProject}
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
                  disabled={!canManageProject}
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
        </ProjectSectionCard>
        ) : null}
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
                onClick={() => {
                  setWorkspaceMode("arena");
                  setInspectorTab("arena");
                }}
                disabled={(arenaCompareMode === "sessions" ? arenaSessionIds.length : arenaBranchKeys.length) < 2}
              >
                Arena
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExitProject}>
                Exit project
              </Button>
            </div>
          </div>
          {shouldPreferArenaOnLoad && workspaceMode === "arena" ? (
            <div className="border-b border-border/60 bg-amber-500/5 px-4 py-2">
              <p className="text-xs text-amber-700">
                Large project detected. Arena opens first so the workspace stays responsive; load the full canvas when you need it.
              </p>
            </div>
          ) : null}
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
                canEdit={canEditProject}
                canManageTypedNodes={canManageProject}
                canOpenSessions={canManageProject}
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
