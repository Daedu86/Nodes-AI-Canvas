import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeProjectMemoryItem,
  type ProjectMemoryItem,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";

type MemoryPatch = {
  content?: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title?: string | null;
  type?: ProjectMemoryType;
};

const MEMORY_FILE_EXTENSION = ".json";

const ensureSafeMemoryId = (memoryId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(memoryId)) {
    throw new Error(`Invalid memory id: ${memoryId}`);
  }
};

const getMemoryStoreDir = () =>
  process.env.PROJECT_MEMORY_STORE_DIR
    ? path.resolve(process.env.PROJECT_MEMORY_STORE_DIR)
    : path.join(process.cwd(), "data", "memory");

const getMemoryFilePath = (memoryId: string) => {
  ensureSafeMemoryId(memoryId);
  return path.join(getMemoryStoreDir(), `${memoryId}${MEMORY_FILE_EXTENSION}`);
};

const sortMemoryItems = (items: ProjectMemoryItem[]) =>
  [...items].sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });

async function ensureMemoryStoreDir() {
  await fs.mkdir(getMemoryStoreDir(), { recursive: true });
}

async function writeMemoryItem(item: ProjectMemoryItem) {
  await ensureMemoryStoreDir();
  const filePath = getMemoryFilePath(item.id);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(item, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readMemoryItemFromPath(filePath: string): Promise<ProjectMemoryItem> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = normalizeProjectMemoryItem(JSON.parse(raw));
  if (!parsed) {
    throw new Error(`Invalid memory item: ${filePath}`);
  }
  return parsed;
}

async function readAllMemoryItems() {
  await ensureMemoryStoreDir();
  const entries = await fs.readdir(getMemoryStoreDir(), { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(MEMORY_FILE_EXTENSION))
      .map((entry) => readMemoryItemFromPath(path.join(getMemoryStoreDir(), entry.name))),
  );
}

export async function listMemoryItems() {
  const items = await readAllMemoryItems();
  return sortMemoryItems(items);
}

export async function getMemoryItem(memoryId: string) {
  return readMemoryItemFromPath(getMemoryFilePath(memoryId));
}

export async function createMemoryItem(input: {
  content: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title: string;
  type: ProjectMemoryType;
}) {
  const now = new Date().toISOString();
  const item: ProjectMemoryItem = {
    content: input.content,
    createdAt: now,
    id: randomUUID(),
    sourceProjectId:
      typeof input.sourceProjectId === "string" && input.sourceProjectId.length > 0
        ? input.sourceProjectId
        : null,
    sourceKeys: Array.isArray(input.sourceKeys)
      ? [...new Set(input.sourceKeys.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [],
    sourceKind: input.sourceKind === "session" || input.sourceKind === "branch" ? input.sourceKind : null,
    sourceSessionId:
      typeof input.sourceSessionId === "string" && input.sourceSessionId.length > 0
        ? input.sourceSessionId
        : null,
    title: input.title.trim(),
    type: input.type,
    updatedAt: now,
  };
  await writeMemoryItem(item);
  return item;
}

export async function patchMemoryItem(memoryId: string, patch: MemoryPatch) {
  const current = await getMemoryItem(memoryId);
  const next: ProjectMemoryItem = {
    content:
      patch.content === undefined
        ? current.content
        : patch.content,
    createdAt: current.createdAt,
    id: current.id,
    sourceProjectId:
      patch.sourceProjectId === undefined
        ? current.sourceProjectId
        : patch.sourceProjectId,
    sourceKeys:
      patch.sourceKeys === undefined
        ? current.sourceKeys
        : [...new Set(patch.sourceKeys.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))],
    sourceKind:
      patch.sourceKind === undefined
        ? current.sourceKind
        : patch.sourceKind,
    sourceSessionId:
      patch.sourceSessionId === undefined
        ? current.sourceSessionId
        : patch.sourceSessionId,
    title:
      patch.title === undefined
        ? current.title
        : patch.title?.trim() || current.title,
    type: patch.type ?? current.type,
    updatedAt: new Date().toISOString(),
  };
  await writeMemoryItem(next);
  return next;
}

export async function deleteMemoryItem(memoryId: string) {
  await fs.rm(getMemoryFilePath(memoryId), { force: true });
}

export async function deleteMemoryItems(memoryIds: string[]) {
  const uniqueIds = [...new Set(memoryIds)];
  await Promise.all(uniqueIds.map((memoryId) => deleteMemoryItem(memoryId)));
}
