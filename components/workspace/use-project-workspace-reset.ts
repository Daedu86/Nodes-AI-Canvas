"use client";

import React from "react";
import type { ProjectCanvasSelection } from "@/components/workspace/project-canvas";
import type { ProjectCollaboratorRole, ProjectDocument } from "@/lib/project-documents";
import type { ProjectMemoryType } from "@/lib/memory-documents";

export type ArenaCompareMode = "sessions" | "branches";
export type ProjectInspectorTab = "context" | "arena" | "nodes" | "sessions" | "focus";
type ActionState = "idle" | "saving" | "saved" | "error";
type WorkspaceMode = "canvas" | "arena";

export const PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD = 10;

type ProjectWorkspaceResetOptions = {
  activeProject: ProjectDocument | null;
  setArenaBranchKeys: React.Dispatch<React.SetStateAction<string[]>>;
  setArenaCompareMode: React.Dispatch<React.SetStateAction<ArenaCompareMode>>;
  setArenaSessionIds: React.Dispatch<React.SetStateAction<string[]>>;
  setContextSaveState: React.Dispatch<React.SetStateAction<ActionState>>;
  setGlobalContextDraft: React.Dispatch<React.SetStateAction<string>>;
  setInspectorTab: React.Dispatch<React.SetStateAction<ProjectInspectorTab>>;
  setMemberActionMessage: React.Dispatch<React.SetStateAction<string>>;
  setMemberActionState: React.Dispatch<React.SetStateAction<ActionState>>;
  setMemberEmailDraft: React.Dispatch<React.SetStateAction<string>>;
  setMemberRoleDraft: React.Dispatch<React.SetStateAction<ProjectCollaboratorRole>>;
  setMemoryActionMessage: React.Dispatch<React.SetStateAction<string>>;
  setMemoryActionState: React.Dispatch<React.SetStateAction<ActionState>>;
  setMemoryContentDraft: React.Dispatch<React.SetStateAction<string>>;
  setMemoryTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  setMemoryTypeDraft: React.Dispatch<React.SetStateAction<ProjectMemoryType>>;
  setSelectedCanvasItem: React.Dispatch<React.SetStateAction<ProjectCanvasSelection>>;
  setSelectedContextSourceIds: React.Dispatch<React.SetStateAction<string[]>>;
  setTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  setWorkspaceMode: React.Dispatch<React.SetStateAction<WorkspaceMode>>;
};

export function useResetProjectWorkspaceState({
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
}: ProjectWorkspaceResetOptions) {
  React.useEffect(() => {
    setTitleDraft(activeProject?.title ?? "");
    setGlobalContextDraft(activeProject?.globalContext ?? "");
    setSelectedCanvasItem(null);
    setContextSaveState("idle");
    setMemoryActionState("idle");
    setMemoryTitleDraft("Arena synthesis");
    setMemoryTypeDraft("summary");
    setMemoryContentDraft("");
    setMemoryActionMessage("Create a typed node and attach it to this project.");
    setMemberEmailDraft("");
    setMemberRoleDraft("viewer");
    setMemberActionState("idle");
    setMemberActionMessage("Share this project with editors or viewers.");
    setWorkspaceMode(
      (activeProject?.sessionIds.length ?? 0) >=
        PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD
        ? "arena"
        : "canvas",
    );
    setArenaCompareMode("sessions");
    setArenaSessionIds([]);
    setArenaBranchKeys([]);
    setSelectedContextSourceIds([]);
    setInspectorTab("context");
  }, [
    activeProject?.globalContext,
    activeProject?.id,
    activeProject?.sessionIds.length,
    activeProject?.title,
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
  ]);
}
