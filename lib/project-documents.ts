const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export type ProjectSummary = {
  arenaWinnerBranchKey: string | null;
  arenaWinnerSessionId: string | null;
  createdAt: string;
  id: string;
  memoryIds: string[];
  sessionCount: number;
  title: string | null;
  updatedAt: string;
};

export type ProjectDocument = ProjectSummary & {
  globalContext: string;
  sessionIds: string[];
};

export const normalizeProjectDocument = (value: unknown): ProjectDocument | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  if (!id) return null;

  const sessionIds = Array.isArray(value.sessionIds)
    ? [...new Set(value.sessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
    : [];
  const memoryIds = Array.isArray(value.memoryIds)
    ? [...new Set(value.memoryIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
    : [];

  return {
    arenaWinnerBranchKey:
      typeof value.arenaWinnerBranchKey === "string" && value.arenaWinnerBranchKey.length > 0
        ? value.arenaWinnerBranchKey
        : null,
    arenaWinnerSessionId:
      typeof value.arenaWinnerSessionId === "string" && value.arenaWinnerSessionId.length > 0
        ? value.arenaWinnerSessionId
        : null,
    createdAt:
      typeof value.createdAt === "string" && value.createdAt.length > 0
        ? value.createdAt
        : new Date().toISOString(),
    globalContext: typeof value.globalContext === "string" ? value.globalContext : "",
    id,
    memoryIds,
    sessionCount: sessionIds.length,
    sessionIds,
    title:
      typeof value.title === "string" && value.title.trim().length > 0
        ? value.title.trim()
        : null,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.length > 0
        ? value.updatedAt
        : new Date().toISOString(),
  };
};
