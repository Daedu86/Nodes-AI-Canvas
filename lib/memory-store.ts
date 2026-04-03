import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeProjectMemoryItem,
  type ProjectMemoryItem,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";

type StoredMemoryItem = ProjectMemoryItem & {
  ownerId: string | null;
};

type MemoryPatch = {
  content?: string;
  ownerId?: string | null;
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

const normalizeOwnerId = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const toMemoryItem = (storedItem: StoredMemoryItem): ProjectMemoryItem => {
  const { ownerId, ...item } = storedItem;
  void ownerId;
  return item;
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

async function writeMemoryItem(item: StoredMemoryItem) {
  await ensureMemoryStoreDir();
  const filePath = getMemoryFilePath(item.id);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(item, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readMemoryItemFromPath(filePath: string): Promise<StoredMemoryItem> {
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw) as { ownerId?: unknown };
  const parsed = normalizeProjectMemoryItem(json);
  if (!parsed) {
    throw new Error(`Invalid memory item: ${filePath}`);
  }
  return {
    ...parsed,
    ownerId: normalizeOwnerId(json.ownerId),
  };
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

async function claimMemoryOwnerIfNeeded(item: StoredMemoryItem, ownerId: string) {
  if (item.ownerId === ownerId) {
    return item;
  }
  if (item.ownerId) {
    return null;
  }
  const claimed = {
    ...item,
    ownerId,
  };
  await writeMemoryItem(claimed);
  return claimed;
}

async function getStoredMemoryItem(memoryId: string, ownerId?: string) {
  const item = await readMemoryItemFromPath(getMemoryFilePath(memoryId));
  if (!ownerId) {
    return item;
  }
  const claimed = await claimMemoryOwnerIfNeeded(item, ownerId);
  if (!claimed) {
    throw new Error("Memory not found");
  }
  return claimed;
}

export async function listMemoryItems(options: { ownerId?: string } = {}) {
  const ownerId = typeof options.ownerId === "string" && options.ownerId.length > 0
    ? options.ownerId
    : null;
  let items = await readAllMemoryItems();
  if (ownerId) {
    const visibleItems: StoredMemoryItem[] = [];
    for (const item of items) {
      const claimed = await claimMemoryOwnerIfNeeded(item, ownerId);
      if (claimed) {
        visibleItems.push(claimed);
      }
    }
    items = visibleItems;
  }
  return sortMemoryItems(items.map((item) => toMemoryItem(item)));
}

export async function getMemoryItem(memoryId: string, ownerId?: string) {
  return toMemoryItem(await getStoredMemoryItem(memoryId, ownerId));
}

export async function createMemoryItem(input: {
  content: string;
  ownerId?: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title: string;
  type: ProjectMemoryType;
}) {
  const now = new Date().toISOString();
  const item: StoredMemoryItem = {
    content: input.content,
    createdAt: now,
    id: randomUUID(),
    ownerId: normalizeOwnerId(input.ownerId),
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
  return toMemoryItem(item);
}

export async function patchMemoryItem(memoryId: string, patch: MemoryPatch, ownerId?: string) {
  const current = await getStoredMemoryItem(memoryId, ownerId);
  const next: StoredMemoryItem = {
    content:
      patch.content === undefined
        ? current.content
        : patch.content,
    createdAt: current.createdAt,
    id: current.id,
    ownerId: current.ownerId,
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
  return toMemoryItem(next);
}

export async function deleteMemoryItem(memoryId: string, ownerId?: string) {
  const item = await getStoredMemoryItem(memoryId, ownerId);
  await fs.rm(getMemoryFilePath(item.id), { force: true });
}

export async function deleteMemoryItems(memoryIds: string[], ownerId?: string) {
  const uniqueIds = [...new Set(memoryIds)];
  await Promise.all(uniqueIds.map((memoryId) => deleteMemoryItem(memoryId, ownerId)));
}
