const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const PROJECT_MEMORY_TYPES = [
  "question",
  "draft",
  "critique",
  "decision",
  "summary",
  "evidence",
  "merge",
] as const;

export type ProjectMemoryType = (typeof PROJECT_MEMORY_TYPES)[number];
export type ProjectMemorySourceKind = "session" | "branch" | null;

export type ProjectMemoryItem = {
  content: string;
  createdAt: string;
  id: string;
  sourceProjectId: string | null;
  sourceKeys: string[];
  sourceKind: ProjectMemorySourceKind;
  sourceSessionId: string | null;
  title: string;
  type: ProjectMemoryType;
  updatedAt: string;
};

const isProjectMemoryType = (value: unknown): value is ProjectMemoryType =>
  typeof value === "string" &&
  (PROJECT_MEMORY_TYPES as readonly string[]).includes(value);

export const normalizeProjectMemoryItem = (value: unknown): ProjectMemoryItem | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  const title = typeof value.title === "string" && value.title.trim().length > 0
    ? value.title.trim()
    : null;
  const type = isProjectMemoryType(value.type) ? value.type : null;
  const content = typeof value.content === "string" ? value.content : "";
  if (!id || !title || !type || !content.trim()) return null;

  return {
    content,
    createdAt:
      typeof value.createdAt === "string" && value.createdAt.length > 0
        ? value.createdAt
        : new Date().toISOString(),
    id,
    sourceProjectId:
      typeof value.sourceProjectId === "string" && value.sourceProjectId.length > 0
        ? value.sourceProjectId
        : null,
    sourceKeys: Array.isArray(value.sourceKeys)
      ? [...new Set(value.sourceKeys.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [],
    sourceKind:
      value.sourceKind === "session" || value.sourceKind === "branch"
        ? value.sourceKind
        : null,
    sourceSessionId:
      typeof value.sourceSessionId === "string" && value.sourceSessionId.length > 0
        ? value.sourceSessionId
        : null,
    title,
    type,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.length > 0
        ? value.updatedAt
        : new Date().toISOString(),
  };
};
