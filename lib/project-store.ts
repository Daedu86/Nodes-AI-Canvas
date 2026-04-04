import { getProjectRepository } from "@/lib/persistence/repositories";
import type {
  ProjectCreateInput,
  ProjectListOptions,
  ProjectPatch,
} from "@/lib/persistence/project-repository";

export type { ProjectCreateInput, ProjectListOptions, ProjectPatch };

export async function listProjects(options: ProjectListOptions = {}) {
  return getProjectRepository().listProjects(options);
}

export async function getProject(projectId: string, ownerId?: string) {
  return getProjectRepository().getProject(projectId, ownerId);
}

export async function createProject(input: ProjectCreateInput = {}) {
  return getProjectRepository().createProject(input);
}

export async function patchProject(projectId: string, patch: ProjectPatch, ownerId?: string) {
  return getProjectRepository().patchProject(projectId, patch, ownerId);
}

export async function deleteProject(projectId: string, ownerId?: string) {
  return getProjectRepository().deleteProject(projectId, ownerId);
}

export async function deleteProjects(projectIds: string[], ownerId?: string) {
  return getProjectRepository().deleteProjects(projectIds, ownerId);
}
