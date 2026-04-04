import { getProjectRepository } from "@/lib/persistence/repositories";
import type {
  ProjectActor,
  ProjectCreateInput,
  ProjectListOptions,
  ProjectMemberInput,
  ProjectPatch,
} from "@/lib/persistence/project-repository";

export type {
  ProjectActor,
  ProjectCreateInput,
  ProjectListOptions,
  ProjectMemberInput,
  ProjectPatch,
};

export async function listProjects(options: ProjectListOptions = {}) {
  return getProjectRepository().listProjects(options);
}

export async function getProject(projectId: string, ownerId?: string) {
  return getProjectRepository().getProject(projectId, ownerId);
}

export async function getProjectRecordForActor(projectId: string, actor: ProjectActor) {
  return getProjectRepository().getProjectRecordForActor(projectId, actor);
}

export async function createProject(input: ProjectCreateInput = {}) {
  return getProjectRepository().createProject(input);
}

export async function patchProject(projectId: string, patch: ProjectPatch, ownerId?: string) {
  return getProjectRepository().patchProject(projectId, patch, ownerId);
}

export async function listProjectsForActor(actor: ProjectActor) {
  return getProjectRepository().listProjectsForActor(actor);
}

export async function upsertProjectMember(projectId: string, member: ProjectMemberInput, ownerId?: string) {
  return getProjectRepository().upsertProjectMember(projectId, member, ownerId);
}

export async function removeProjectMember(projectId: string, memberEmail: string, ownerId?: string) {
  return getProjectRepository().removeProjectMember(projectId, memberEmail, ownerId);
}

export async function deleteProject(projectId: string, ownerId?: string) {
  return getProjectRepository().deleteProject(projectId, ownerId);
}

export async function deleteProjects(projectIds: string[], ownerId?: string) {
  return getProjectRepository().deleteProjects(projectIds, ownerId);
}
