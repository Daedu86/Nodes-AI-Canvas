"use client";

import React from "react";
import type { ProjectDocument, ProjectSummary } from "@/lib/project-documents";

type ProjectsContextValue = {
  activeProject: ProjectDocument | null;
  activeProjectId: string | null;
  clearActiveProject: () => void;
  createProject: (input?: {
    globalContext?: string;
    memoryIds?: string[];
    sessionIds?: string[];
    title?: string | null;
  }) => Promise<ProjectDocument>;
  deleteProject: (projectId: string) => Promise<void>;
  deleteProjects: (projectIds: string[]) => Promise<void>;
  isReady: boolean;
  projects: ProjectSummary[];
  refreshProjects: () => Promise<ProjectSummary[]>;
  renameProject: (projectId: string, title: string | null) => Promise<void>;
  saveActiveProjectPatch: (patch: {
    arenaWinnerBranchKey?: string | null;
    arenaWinnerSessionId?: string | null;
    globalContext?: string;
    memoryIds?: string[];
    sessionIds?: string[];
    title?: string | null;
  }) => Promise<ProjectDocument | null>;
  selectProject: (projectId: string) => Promise<void>;
};

type ProjectsListResponse = {
  projects: ProjectSummary[];
};

type ProjectResponse = {
  project: ProjectDocument;
};

const ACTIVE_PROJECT_KEY = "assistant-ui.active-project-id.v1";
const AUTO_OPEN_PROJECT_SESSION_THRESHOLD = 10;

const ProjectsContext = React.createContext<ProjectsContextValue | null>(null);

const readStoredActiveProjectId = () => {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
};

const writeStoredActiveProjectId = (projectId: string | null) => {
  try {
    if (!projectId) {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } catch {
    // ignore storage errors
  }
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = React.useState<ProjectDocument | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const activeProjectRef = React.useRef<ProjectDocument | null>(null);
  const patchQueueRef = React.useRef<Promise<ProjectDocument | null>>(Promise.resolve(null));

  React.useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  const loadProject = React.useCallback(async (projectId: string) => {
    const data = await fetchJson<ProjectResponse>(`/api/projects/${projectId}`);
    setActiveProject(data.project);
    writeStoredActiveProjectId(data.project.id);
    return data.project;
  }, []);

  const refreshProjects = React.useCallback(async () => {
    const data = await fetchJson<ProjectsListResponse>("/api/projects");
    setProjects(data.projects);
    return data.projects;
  }, []);

  React.useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setIsReady(false);
      try {
        const loadedProjects = await refreshProjects();
        const preferredId = readStoredActiveProjectId();
        const preferredProject = preferredId
          ? loadedProjects.find((project) => project.id === preferredId) ?? null
          : null;

        if (
          preferredProject &&
          preferredProject.sessionCount >= AUTO_OPEN_PROJECT_SESSION_THRESHOLD
        ) {
          if (mounted) {
            setActiveProject(null);
            writeStoredActiveProjectId(null);
          }
        } else if (preferredId && loadedProjects.some((project) => project.id === preferredId)) {
          try {
            await loadProject(preferredId);
          } catch {
            if (mounted) {
              setActiveProject(null);
              writeStoredActiveProjectId(null);
            }
          }
        } else if (mounted) {
          setActiveProject(null);
          writeStoredActiveProjectId(null);
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [loadProject, refreshProjects]);

  const clearActiveProject = React.useCallback(() => {
    setActiveProject(null);
    writeStoredActiveProjectId(null);
  }, []);

  const selectProject = React.useCallback(async (projectId: string) => {
    setIsReady(false);
    try {
      await loadProject(projectId);
    } finally {
      setIsReady(true);
    }
  }, [loadProject]);

  const createProject = React.useCallback(async (input?: {
    globalContext?: string;
    memoryIds?: string[];
    sessionIds?: string[];
    title?: string | null;
  }) => {
    setIsReady(false);
    try {
      const data = await fetchJson<ProjectResponse>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      });
      setProjects((prev) => [data.project, ...prev]);
      setActiveProject(data.project);
      writeStoredActiveProjectId(data.project.id);
      return data.project;
    } finally {
      setIsReady(true);
    }
  }, []);

  const deleteProjects = React.useCallback(async (projectIds: string[]) => {
    const uniqueProjectIds = [...new Set(projectIds)].filter((projectId) => projectId.length > 0);
    if (uniqueProjectIds.length === 0) return;
    const currentActiveProjectId = activeProjectRef.current?.id ?? null;
    const deletingActiveProject =
      currentActiveProjectId !== null && uniqueProjectIds.includes(currentActiveProjectId);

    if (deletingActiveProject) {
      activeProjectRef.current = null;
      setActiveProject(null);
      writeStoredActiveProjectId(null);
    }

    const response = await fetch("/api/projects", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectIds: uniqueProjectIds }),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const remaining = await refreshProjects();
    if (deletingActiveProject) {
      const nextProjectId = remaining[0]?.id ?? null;
      if (nextProjectId) {
        await loadProject(nextProjectId);
      } else {
        clearActiveProject();
      }
    }
  }, [clearActiveProject, loadProject, refreshProjects]);

  const deleteProject = React.useCallback(async (projectId: string) => {
    await deleteProjects([projectId]);
  }, [deleteProjects]);

  const renameProject = React.useCallback(async (projectId: string, title: string | null) => {
    const data = await fetchJson<ProjectResponse>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    setProjects((prev) =>
      prev.map((project) => (project.id === projectId ? data.project : project)),
    );
    setActiveProject((prev) => (prev?.id === projectId ? data.project : prev));
  }, []);

  const saveActiveProjectPatch = React.useCallback((patch: {
    arenaWinnerBranchKey?: string | null;
    arenaWinnerSessionId?: string | null;
    globalContext?: string;
    memoryIds?: string[];
    sessionIds?: string[];
    title?: string | null;
  }) => {
    const enqueue = async () => {
      const projectId = activeProjectRef.current?.id;
      if (!projectId) return null;
      const data = await fetchJson<ProjectResponse>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setActiveProject(data.project);
      setProjects((prev) =>
        prev.map((project) => (project.id === data.project.id ? data.project : project)),
      );
      activeProjectRef.current = data.project;
      return data.project;
    };

    const nextPatch = patchQueueRef.current.then(enqueue, enqueue);
    patchQueueRef.current = nextPatch.catch(() => null);
    return nextPatch;
  }, []);

  const value = React.useMemo<ProjectsContextValue>(() => ({
    activeProject,
    activeProjectId: activeProject?.id ?? null,
    clearActiveProject,
    createProject,
    deleteProject,
    deleteProjects,
    isReady,
    projects,
    refreshProjects,
    renameProject,
    saveActiveProjectPatch,
    selectProject,
  }), [
    activeProject,
    clearActiveProject,
    createProject,
    deleteProject,
    deleteProjects,
    isReady,
    projects,
    refreshProjects,
    renameProject,
    saveActiveProjectPatch,
    selectProject,
  ]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = React.useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return context;
}
