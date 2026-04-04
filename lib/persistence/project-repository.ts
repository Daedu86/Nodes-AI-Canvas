import type { ProjectDocument, ProjectSummary } from "@/lib/project-documents";

export type ProjectListOptions = {
  ownerId?: string;
};

export type ProjectCreateInput = {
  globalContext?: string;
  memoryIds?: string[];
  ownerId?: string;
  sessionIds?: string[];
  title?: string | null;
};

export type ProjectPatch = {
  arenaWinnerBranchKey?: string | null;
  arenaWinnerSessionId?: string | null;
  globalContext?: string;
  memoryIds?: string[];
  sessionIds?: string[];
  title?: string | null;
};

export interface ProjectRepository {
  createProject(input?: ProjectCreateInput): Promise<ProjectDocument>;
  deleteProject(projectId: string, ownerId?: string): Promise<void>;
  deleteProjects(projectIds: string[], ownerId?: string): Promise<void>;
  getProject(projectId: string, ownerId?: string): Promise<ProjectDocument>;
  listProjects(options?: ProjectListOptions): Promise<ProjectSummary[]>;
  patchProject(projectId: string, patch: ProjectPatch, ownerId?: string): Promise<ProjectDocument>;
}
