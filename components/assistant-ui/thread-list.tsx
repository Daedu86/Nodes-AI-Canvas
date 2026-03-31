"use client";

import React, { type FC } from "react";
import {
  ArchiveIcon,
  CheckSquare2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  Network,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useProjects } from "@/components/context/projects";
import { usePersistedSessions } from "@/components/context/persisted-sessions";

const formatTitle = (title: string | null) => title?.trim() || "New Chat";
const formatProjectTitle = (title: string | null) => title?.trim() || "Untitled Project";

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

export const ThreadList: FC = () => {
  const {
    activeSessionId,
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    selectSession,
    sessions,
  } = usePersistedSessions();
  const {
    activeProjectId,
    clearActiveProject,
    createProject,
    deleteProject,
    projects,
    selectProject,
  } = useProjects();
  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const [savedSessionsOpen, setSavedSessionsOpen] = React.useState(true);
  const [selectedSessionIds, setSelectedSessionIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setSelectedSessionIds((prev) => {
      const availableSessionIds = new Set(sessions.map((session) => session.id));
      const next = new Set<string>();
      prev.forEach((sessionId) => {
        if (availableSessionIds.has(sessionId)) {
          next.add(sessionId);
        }
      });
      return next;
    });
  }, [sessions]);

  const allSessionIds = React.useMemo(() => sessions.map((session) => session.id), [sessions]);
  const selectedCount = selectedSessionIds.size;
  const allSelected = sessions.length > 0 && sessions.every((session) => selectedSessionIds.has(session.id));

  const buildProjectTitle = React.useCallback((sessionIds: string[]) => {
    if (sessionIds.length === 1) {
      const session = sessions.find((entry) => entry.id === sessionIds[0]);
      return session?.title?.trim() ? `${session.title.trim()} Project` : "Single Session Project";
    }
    if (sessionIds.length > 1) {
      return `${sessionIds.length} Session Project`;
    }
    return null;
  }, [sessions]);

  const toggleSessionSelection = React.useCallback((sessionId: string, checked: boolean) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = React.useCallback(() => {
    setSelectedSessionIds((prev) => {
      if (sessions.length === 0) return prev;
      if (sessions.every((session) => prev.has(session.id))) {
        return new Set<string>();
      }
      return new Set(allSessionIds);
    });
  }, [allSessionIds, sessions]);

  const handleDeleteSelected = React.useCallback(async () => {
    if (selectedSessionIds.size === 0) return;
    const confirmed = window.confirm(`Delete ${selectedSessionIds.size} selected session(s)?`);
    if (!confirmed) return;
    await deleteSessions([...selectedSessionIds]);
    setSelectedSessionIds(new Set());
  }, [deleteSessions, selectedSessionIds]);

  const handleDeleteAll = React.useCallback(async () => {
    if (sessions.length === 0) return;
    const confirmed = window.confirm(`Delete all ${sessions.length} saved session(s)?`);
    if (!confirmed) return;
    await deleteSessions(allSessionIds);
    setSelectedSessionIds(new Set());
  }, [allSessionIds, deleteSessions, sessions.length]);

  const handleCreateEmptyProject = React.useCallback(async () => {
    await createProject();
  }, [createProject]);

  const handleCreateProjectFromSelected = React.useCallback(async () => {
    const sessionIds = [...selectedSessionIds];
    if (sessionIds.length === 0) return;
    await createProject({
      sessionIds,
      title: buildProjectTitle(sessionIds),
    });
  }, [buildProjectTitle, createProject, selectedSessionIds]);

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        className="data-[active]:bg-muted hover:bg-muted flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start"
        variant="ghost"
        onClick={() => {
          clearActiveProject();
          void createSession();
        }}
      >
        <PlusIcon />
        New Session
      </Button>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-background/60">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/60"
          onClick={() => setProjectsOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Network className="h-4 w-4" />
            Projects
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{projects.length}</span>
            {projectsOpen ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </span>
        </button>

        {projectsOpen ? (
          <div className="border-t border-border/60">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  void handleCreateEmptyProject();
                }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New project
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  void handleCreateProjectFromSelected();
                }}
                disabled={selectedCount === 0}
              >
                <Network className="h-3.5 w-3.5" />
                From selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
            </div>

            {projects.length === 0 ? (
              <div className="text-muted-foreground px-3 py-3 text-sm">
                No projects yet.
              </div>
            ) : null}

            <div className="flex max-h-[32vh] flex-col overflow-y-auto pb-1">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                return (
                  <div
                    key={project.id}
                    className="data-[active]:bg-muted hover:bg-muted mx-1 mb-1 flex items-center gap-2 rounded-lg"
                    data-active={isActive ? "true" : "false"}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-grow flex-col px-3 py-2 text-start"
                      onClick={() => {
                        void selectProject(project.id);
                      }}
                    >
                      <span className="flex items-center gap-2 truncate text-sm">
                        <span className="truncate">{formatProjectTitle(project.title)}</span>
                        {isActive ? (
                          <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-sky-700">
                            Open
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {project.sessionCount} sessions · {formatUpdatedAt(project.updatedAt)}
                      </span>
                    </button>
                    <TooltipIconButton
                      className="text-foreground hover:text-destructive mr-3 size-4 p-0"
                      variant="ghost"
                      tooltip="Delete project"
                      onClick={() => {
                        void deleteProject(project.id);
                      }}
                    >
                      <Trash2Icon />
                    </TooltipIconButton>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-background/60">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/60"
          onClick={() => setSavedSessionsOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <FolderOpenIcon className="h-4 w-4" />
            Saved Sessions
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{sessions.length}</span>
            {savedSessionsOpen ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </span>
        </button>

        {savedSessionsOpen ? (
          <div className="border-t border-border/60">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={handleSelectAll}
                disabled={sessions.length === 0}
              >
                <CheckSquare2Icon className="h-3.5 w-3.5" />
                {allSelected ? "Clear all" : "Select all"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={handleDeleteAll}
                disabled={sessions.length === 0}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Delete all
              </Button>
            </div>

            {!isReady ? (
              <div className="text-muted-foreground px-3 py-2 text-sm">Loading sessions...</div>
            ) : null}

            {isReady && sessions.length === 0 ? (
              <div className="text-muted-foreground px-3 py-3 text-sm">
                No saved sessions yet.
              </div>
            ) : null}

            <div className="flex max-h-[52vh] flex-col overflow-y-auto pb-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isSelected = selectedSessionIds.has(session.id);
                return (
                  <div
                    key={session.id}
                    className="data-[active]:bg-muted hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring mx-1 mb-1 flex items-center gap-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2"
                    data-active={isActive ? "true" : "false"}
                  >
                    <label className="flex items-center pl-3">
                      <input
                        type="checkbox"
                        aria-label={`Select session ${formatTitle(session.title)}`}
                        checked={isSelected}
                        onChange={(event) => {
                          toggleSessionSelection(session.id, event.currentTarget.checked);
                        }}
                        className="h-4 w-4 rounded border-border/70"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        clearActiveProject();
                        void selectSession(session.id);
                      }}
                      className="flex min-w-0 flex-grow flex-col px-1 py-2 text-start"
                    >
                      <span className="flex items-center gap-2 truncate text-sm">
                        <span className="truncate">{formatTitle(session.title)}</span>
                        {session.archived ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-700">
                            Archived
                          </span>
                        ) : null}
                        {isActive ? (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-700">
                            Active
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {session.messageCount} messages · {formatUpdatedAt(session.updatedAt)}
                      </span>
                    </button>
                    {!session.archived ? (
                      <TooltipIconButton
                        className="hover:text-primary text-foreground ml-auto size-4 p-0"
                        variant="ghost"
                        tooltip="Archive session"
                        onClick={() => {
                          void archiveSession(session.id);
                        }}
                      >
                        <ArchiveIcon />
                      </TooltipIconButton>
                    ) : (
                      <span className="ml-auto w-4" aria-hidden="true" />
                    )}
                    <TooltipIconButton
                      className="text-foreground hover:text-destructive mr-3 size-4 p-0"
                      variant="ghost"
                      tooltip="Delete session"
                      onClick={() => {
                        void deleteSession(session.id);
                      }}
                    >
                      <Trash2Icon />
                    </TooltipIconButton>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
