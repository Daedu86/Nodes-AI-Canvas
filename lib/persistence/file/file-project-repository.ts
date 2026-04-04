import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ProjectCreateInput,
  ProjectPatch,
  ProjectRepository,
} from "@/lib/persistence/project-repository";
import {
  normalizeProjectDocument,
  type ProjectDocument,
  type ProjectSummary,
} from "@/lib/project-documents";

type StoredProject = Omit<ProjectDocument, "sessionCount"> & {
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

const toStoredProject = (
  project: ProjectDocument,
  ownerId: string | null,
): StoredProject => {
  const { sessionCount, ...storedProject } = project;
  void sessionCount;
  return {
    ...storedProject,
    ownerId,
  };
};

const toProjectDocument = (storedProject: StoredProject): ProjectDocument => {
  const { ownerId, ...project } = storedProject;
  void ownerId;
  return {
    ...project,
    sessionCount: project.sessionIds.length,
  };
};

const sortProjects = (projects: ProjectSummary[]) =>
  [...projects].sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });

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
  return toStoredProject(parsed, normalizeOwnerId(json.ownerId));
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
      projects.map<ProjectSummary>((storedProject) => {
        const { ownerId: unusedOwnerId, sessionIds, ...project } = storedProject;
        void unusedOwnerId;
        return {
          ...project,
          sessionCount: sessionIds.length,
        };
      }),
    );
  },

  async getProject(projectId, ownerId) {
    return toProjectDocument(await getStoredProject(projectId, ownerId));
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
      ownerId: normalizeOwnerId(input.ownerId),
      sessionIds,
      title:
        typeof input.title === "string" && input.title.trim().length > 0
          ? input.title.trim()
          : null,
      updatedAt: now,
    };
    await writeProjectDocument(project);
    return toProjectDocument(project);
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
    return toProjectDocument(next);
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
