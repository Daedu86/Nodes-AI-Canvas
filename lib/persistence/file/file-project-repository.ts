import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ProjectActor,
  ProjectCreateInput,
  ProjectMemberInput,
  ProjectPatch,
  ProjectRecord,
  ProjectRepository,
} from "@/lib/persistence/project-repository";
import {
  normalizeProjectDocument,
  type ProjectDocument,
  type ProjectMember,
  type ProjectSummary,
} from "@/lib/project-documents";

type StoredProject = Omit<ProjectDocument, "accessRole" | "sessionCount"> & {
  ownerId: string | null;
};

const PROJECT_FILE_EXTENSION = ".json";

const ensureSafeProjectId = (projectId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error(`Invalid project id: ${projectId}`);
  }
};

const getProjectStoreDir = () =>
  process.env.PROJECT_STORE_DIR
    ? path.resolve(process.env.PROJECT_STORE_DIR)
    : path.join(process.cwd(), "data", "projects");

const getProjectFilePath = (projectId: string) => {
  ensureSafeProjectId(projectId);
  return path.join(getProjectStoreDir(), `${projectId}${PROJECT_FILE_EXTENSION}`);
};

const normalizeOwnerId = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const normalizeMemberEmail = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const sortProjects = (projects: ProjectSummary[]) =>
  [...projects].sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    const createdDelta = b.createdAt.localeCompare(a.createdAt);
    if (createdDelta !== 0) return createdDelta;
    // Final deterministic tiebreaker (directory iteration order differs across platforms).
    return a.id.localeCompare(b.id);
  });

const toStoredProject = (
  project: ProjectDocument,
  ownerId: string | null,
): StoredProject => {
  const { accessRole, attachedMemoryItems, sessionCount, sessions, ...storedProject } = project;
  void accessRole;
  void attachedMemoryItems;
  void sessionCount;
  void sessions;
  return {
    ...storedProject,
    ownerId,
  };
};

const toProjectDocument = (
  storedProject: StoredProject,
  accessRole: ProjectDocument["accessRole"] = "owner",
): ProjectDocument => {
  const { ownerId, ...project } = storedProject;
  void ownerId;
  return {
    ...project,
    accessRole,
    sessionCount: project.sessionIds.length,
  };
};

const toProjectRecord = (
  storedProject: StoredProject,
  accessRole: ProjectDocument["accessRole"],
): ProjectRecord => {
  if (!storedProject.ownerId) {
    throw new Error("Project not found");
  }
  return {
    ...toProjectDocument(storedProject, accessRole),
    ownerId: storedProject.ownerId,
  };
};

const normalizeStoredMembers = (members: ProjectMember[]) =>
  [...members]
    .map((member) => ({
      addedAt:
        typeof member.addedAt === "string" && member.addedAt.length > 0
          ? member.addedAt
          : new Date().toISOString(),
      email: member.email.trim().toLowerCase(),
      role: member.role,
    }))
    .filter((member) => member.email.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email));

const getActorRoleForProject = (storedProject: StoredProject, actor: ProjectActor) => {
  if (storedProject.ownerId === actor.userId) {
    return "owner" as const;
  }

  const memberEmail = normalizeMemberEmail(actor.userEmail);
  if (!memberEmail) return null;
  const member = storedProject.members.find((entry) => entry.email === memberEmail);
  return member?.role ?? null;
};

async function ensureProjectStoreDir() {
  await fs.mkdir(getProjectStoreDir(), { recursive: true });
}

async function writeProjectDocument(project: StoredProject) {
  await ensureProjectStoreDir();
  const filePath = getProjectFilePath(project.id);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(project, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readProjectDocumentFromPath(filePath: string): Promise<StoredProject> {
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw) as { ownerId?: unknown };
  const parsed = normalizeProjectDocument(json);
  if (!parsed) {
    throw new Error(`Invalid project document: ${filePath}`);
  }
  return toStoredProject({
    ...parsed,
    members: normalizeStoredMembers(parsed.members),
  }, normalizeOwnerId(json.ownerId));
}

async function readAllProjectDocuments() {
  await ensureProjectStoreDir();
  const entries = await fs.readdir(getProjectStoreDir(), { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(PROJECT_FILE_EXTENSION))
      .map((entry) => readProjectDocumentFromPath(path.join(getProjectStoreDir(), entry.name))),
  );
}

async function claimProjectOwnerIfNeeded(project: StoredProject, ownerId: string) {
  if (project.ownerId === ownerId) {
    return project;
  }
  if (project.ownerId) {
    return null;
  }
  const claimed = {
    ...project,
    ownerId,
  };
  await writeProjectDocument(claimed);
  return claimed;
}

async function getStoredProject(projectId: string, ownerId?: string) {
  const project = await readProjectDocumentFromPath(getProjectFilePath(projectId));
  if (!ownerId) {
    return project;
  }
  const claimed = await claimProjectOwnerIfNeeded(project, ownerId);
  if (!claimed) {
    throw new Error("Project not found");
  }
  return claimed;
}

export const fileProjectRepository: ProjectRepository = {
  async listProjects(options = {}) {
    const ownerId = typeof options.ownerId === "string" && options.ownerId.length > 0
      ? options.ownerId
      : null;
    let projects = await readAllProjectDocuments();

    if (ownerId) {
      const visibleProjects: StoredProject[] = [];
      for (const project of projects) {
        const claimed = await claimProjectOwnerIfNeeded(project, ownerId);
        if (claimed) {
          visibleProjects.push(claimed);
        }
      }
      projects = visibleProjects;
    }

    return sortProjects(
      projects.map((storedProject) => {
        const document = toProjectDocument(storedProject, "owner");
        return {
          accessRole: document.accessRole,
          arenaWinnerBranchKey: document.arenaWinnerBranchKey,
          arenaWinnerSessionId: document.arenaWinnerSessionId,
          createdAt: document.createdAt,
          id: document.id,
          memoryIds: document.memoryIds,
          sessionCount: document.sessionCount,
          title: document.title,
          updatedAt: document.updatedAt,
        };
      }),
    );
  },

  async listProjectsForActor(actor) {
    const projects = await readAllProjectDocuments();
    const visibleProjects: ProjectSummary[] = [];

    for (const project of projects) {
      const claimed = await claimProjectOwnerIfNeeded(project, actor.userId);
      const nextProject = claimed ?? project;
      const role = getActorRoleForProject(nextProject, actor);
      if (!role) continue;
      const document = toProjectDocument(nextProject, role);
      visibleProjects.push({
        accessRole: document.accessRole,
        arenaWinnerBranchKey: document.arenaWinnerBranchKey,
        arenaWinnerSessionId: document.arenaWinnerSessionId,
        createdAt: document.createdAt,
        id: document.id,
        memoryIds: document.memoryIds,
        sessionCount: document.sessionCount,
        title: document.title,
        updatedAt: document.updatedAt,
      });
    }

    return sortProjects(visibleProjects);
  },

  async getProject(projectId, ownerId) {
    return toProjectDocument(await getStoredProject(projectId, ownerId), "owner");
  },

  async getProjectRecordForActor(projectId, actor) {
    const project = await readProjectDocumentFromPath(getProjectFilePath(projectId));
    const claimed = await claimProjectOwnerIfNeeded(project, actor.userId);
    const nextProject = claimed ?? project;
    const role = getActorRoleForProject(nextProject, actor);
    if (!role) {
      throw new Error("Project not found");
    }
    return toProjectRecord(nextProject, role);
  },

  async createProject(input: ProjectCreateInput = {}) {
    const now = new Date().toISOString();
    const sessionIds = Array.isArray(input.sessionIds)
      ? [...new Set(input.sessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [];
    const memoryIds = Array.isArray(input.memoryIds)
      ? [...new Set(input.memoryIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [];
    const project: StoredProject = {
      arenaWinnerBranchKey: null,
      arenaWinnerSessionId: null,
      createdAt: now,
      globalContext: typeof input.globalContext === "string" ? input.globalContext : "",
      id: randomUUID(),
      memoryIds,
      members: [],
      ownerId: normalizeOwnerId(input.ownerId),
      sessionIds,
      title:
        typeof input.title === "string" && input.title.trim().length > 0
          ? input.title.trim()
          : null,
      updatedAt: now,
    };
    await writeProjectDocument(project);
    return toProjectDocument(project, "owner");
  },

  async patchProject(projectId, patch: ProjectPatch, ownerId) {
    const current = await getStoredProject(projectId, ownerId);
    const memoryIds = patch.memoryIds === undefined
      ? current.memoryIds
      : [...new Set(patch.memoryIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
    const sessionIds = patch.sessionIds === undefined
      ? current.sessionIds
      : [...new Set(patch.sessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
    const next: StoredProject = {
      arenaWinnerBranchKey:
        patch.arenaWinnerBranchKey === undefined
          ? current.arenaWinnerBranchKey
          : patch.arenaWinnerBranchKey,
      arenaWinnerSessionId:
        patch.arenaWinnerSessionId === undefined
          ? current.arenaWinnerSessionId
          : patch.arenaWinnerSessionId,
      createdAt: current.createdAt,
      globalContext:
        patch.globalContext === undefined
          ? current.globalContext
          : patch.globalContext,
      id: current.id,
      memoryIds,
      members: current.members,
      ownerId: current.ownerId,
      sessionIds,
      title:
        patch.title === undefined
          ? current.title
          : typeof patch.title === "string" && patch.title.trim().length > 0
            ? patch.title.trim()
            : null,
      updatedAt: new Date().toISOString(),
    };
    await writeProjectDocument(next);
    return toProjectDocument(next, "owner");
  },

  async upsertProjectMember(projectId, member: ProjectMemberInput, ownerId) {
    const current = await getStoredProject(projectId, ownerId);
    const email = normalizeMemberEmail(member.email);
    if (!email) {
      throw new Error("A valid member email is required");
    }

    const nextMembers = [
      ...current.members.filter((entry) => entry.email !== email),
      {
        addedAt:
          current.members.find((entry) => entry.email === email)?.addedAt
            ?? new Date().toISOString(),
        email,
        role: member.role,
      } satisfies ProjectMember,
    ].sort((a, b) => a.email.localeCompare(b.email));

    const next: StoredProject = {
      ...current,
      members: nextMembers,
      updatedAt: new Date().toISOString(),
    };
    await writeProjectDocument(next);
    return toProjectDocument(next, "owner");
  },

  async removeProjectMember(projectId, memberEmail, ownerId) {
    const current = await getStoredProject(projectId, ownerId);
    const email = normalizeMemberEmail(memberEmail);
    if (!email) {
      throw new Error("A valid member email is required");
    }

    const next: StoredProject = {
      ...current,
      members: current.members.filter((entry) => entry.email !== email),
      updatedAt: new Date().toISOString(),
    };
    await writeProjectDocument(next);
    return toProjectDocument(next, "owner");
  },

  async deleteProject(projectId, ownerId) {
    const project = await getStoredProject(projectId, ownerId);
    await fs.rm(getProjectFilePath(project.id), { force: true });
  },

  async deleteProjects(projectIds, ownerId) {
    const uniqueProjectIds = [...new Set(projectIds)];
    await Promise.all(
      uniqueProjectIds.map((projectId) => fileProjectRepository.deleteProject(projectId, ownerId)),
    );
  },
};
