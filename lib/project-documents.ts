import type { ProjectMemoryItem } from "@/lib/memory-documents";
import type { SessionDocument } from "@/lib/session-documents";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const PROJECT_COLLABORATOR_ROLES = ["editor", "viewer"] as const;
export const PROJECT_ACCESS_ROLES = ["owner", ...PROJECT_COLLABORATOR_ROLES] as const;

export type ProjectCollaboratorRole = (typeof PROJECT_COLLABORATOR_ROLES)[number];
export type ProjectAccessRole = (typeof PROJECT_ACCESS_ROLES)[number];

export type ProjectMember = {
  addedAt: string;
  email: string;
  role: ProjectCollaboratorRole;
};

export type ProjectSummary = {
  accessRole: ProjectAccessRole;
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
  attachedMemoryItems?: ProjectMemoryItem[];
  globalContext: string;
  members: ProjectMember[];
  sessionIds: string[];
  sessions?: SessionDocument[];
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
  const members = Array.isArray(value.members)
    ? value.members.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const email =
        typeof entry.email === "string" && entry.email.trim().length > 0
          ? entry.email.trim().toLowerCase()
          : null;
      const role =
        typeof entry.role === "string" && PROJECT_COLLABORATOR_ROLES.includes(entry.role as ProjectCollaboratorRole)
          ? (entry.role as ProjectCollaboratorRole)
          : null;
      if (!email || !role) return [];
      return [{
        addedAt:
          typeof entry.addedAt === "string" && entry.addedAt.length > 0
            ? entry.addedAt
            : new Date().toISOString(),
        email,
        role,
      }];
    })
    : [];

  return {
    accessRole:
      typeof value.accessRole === "string" && PROJECT_ACCESS_ROLES.includes(value.accessRole as ProjectAccessRole)
        ? (value.accessRole as ProjectAccessRole)
        : "owner",
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
    members,
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
