import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeProjectDocument,
  type ProjectDocument,
  type ProjectSummary,
} from "@/lib/project-documents";

type StoredProject = Omit<ProjectDocument, "sessionCount">;

type ProjectPatch = {
  arenaWinnerBranchKey?: string | null;
  arenaWinnerSessionId?: string | null;
  globalContext?: string;
  memoryIds?: string[];
  sessionIds?: string[];
  title?: string | null;
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

const toProjectDocument = (project: StoredProject): ProjectDocument => ({
  ...project,
  sessionCount: project.sessionIds.length,
});

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

async function readProjectDocumentFromPath(filePath: string): Promise<ProjectDocument> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = normalizeProjectDocument(JSON.parse(raw));
  if (!parsed) {
    throw new Error(`Invalid project document: ${filePath}`);
  }
  return parsed;
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

export async function listProjects() {
  const projects = await readAllProjectDocuments();
  return sortProjects(projects.map<ProjectSummary>(({ sessionIds, ...project }) => ({
    ...project,
    sessionCount: sessionIds.length,
  })));
}

export async function getProject(projectId: string) {
  return readProjectDocumentFromPath(getProjectFilePath(projectId));
}

export async function createProject(input: {
  globalContext?: string;
  memoryIds?: string[];
  sessionIds?: string[];
  title?: string | null;
} = {}) {
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
    sessionIds,
    title:
      typeof input.title === "string" && input.title.trim().length > 0
        ? input.title.trim()
        : null,
    updatedAt: now,
  };
  await writeProjectDocument(project);
  return toProjectDocument(project);
}

export async function patchProject(projectId: string, patch: ProjectPatch) {
  const current = await getProject(projectId);
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
}

export async function deleteProject(projectId: string) {
  await fs.rm(getProjectFilePath(projectId), { force: true });
}

export async function deleteProjects(projectIds: string[]) {
  const uniqueProjectIds = [...new Set(projectIds)];
  await Promise.all(uniqueProjectIds.map((projectId) => deleteProject(projectId)));
}
