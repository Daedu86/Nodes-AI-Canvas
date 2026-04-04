import {
  getSessionMessageCount,
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
  type SessionDocument,
  type SessionSummary,
} from "@/lib/session-documents";
import type { ProjectDocument, ProjectSummary } from "@/lib/project-documents";
import { type ProjectMemoryItem, normalizeProjectMemoryItem } from "@/lib/memory-documents";
import type {
  SessionBlobCleanupResult,
  SessionBlobMaintenance,
} from "@/lib/session-blob-store";

export const emptyBlobMaintenance = (): SessionBlobMaintenance => ({
  deduplicatedBlobLinks: 0,
  orphanBlobCount: 0,
  orphanBytes: 0,
  referencedBlobCount: 0,
  referencedBlobLinks: 0,
  referencedBytes: 0,
  totalBlobCount: 0,
  totalBytes: 0,
  uniqueReferencedBlobCount: 0,
});

export const emptyBlobCleanup = (): SessionBlobCleanupResult => ({
  deletedBlobCount: 0,
  deletedBytes: 0,
  maintenance: emptyBlobMaintenance(),
});

export const requireOwnerId = (ownerId?: string) => {
  if (typeof ownerId === "string" && ownerId.length > 0) {
    return ownerId;
  }
  throw new Error("Supabase persistence requires an authenticated owner id.");
};

export const ensureData = <T>(data: T | null, error: { message?: string } | null, fallback: string) => {
  if (error) {
    throw new Error(error.message || fallback);
  }
  if (data === null) {
    throw new Error(fallback);
  }
  return data;
};

type SessionRow = {
  archived: boolean;
  artifacts_json: unknown;
  context_links_json: unknown;
  created_at: string;
  id: string;
  snapshot_json: unknown;
  title: string | null;
  updated_at: string;
};

export const toSessionDocumentFromRow = (row: SessionRow): SessionDocument => {
  const snapshot = normalizeSessionThreadExport(row.snapshot_json);
  return {
    id: row.id,
    title: row.title,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshot,
    artifacts: normalizeSessionArtifactsDocument(row.artifacts_json),
    contextLinks: normalizeSessionContextLinksDocument(row.context_links_json),
    messageCount: getSessionMessageCount(snapshot),
  };
};

export const toSessionSummaryFromRow = (row: SessionRow): SessionSummary => {
  const snapshot = normalizeSessionThreadExport(row.snapshot_json);
  return {
    id: row.id,
    title: row.title,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: getSessionMessageCount(snapshot),
  };
};

type ProjectRelationRow = {
  memory_id?: string | null;
  position?: number | null;
  session_id?: string | null;
};

type ProjectRow = {
  arena_winner_branch_key: string | null;
  arena_winner_session_id: string | null;
  created_at: string;
  global_context: string;
  id: string;
  project_memory_links?: ProjectRelationRow[] | null;
  project_sessions?: ProjectRelationRow[] | null;
  title: string | null;
  updated_at: string;
};

export const toProjectDocumentFromRow = (row: ProjectRow): ProjectDocument => {
  const sessionIds = (row.project_sessions ?? [])
    .map((entry) => entry.session_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const memoryIds = (row.project_memory_links ?? [])
    .map((entry) => entry.memory_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return {
    arenaWinnerBranchKey: row.arena_winner_branch_key,
    arenaWinnerSessionId: row.arena_winner_session_id,
    createdAt: row.created_at,
    globalContext: row.global_context,
    id: row.id,
    memoryIds,
    sessionCount: sessionIds.length,
    sessionIds,
    title: row.title,
    updatedAt: row.updated_at,
  };
};

export const toProjectSummaryFromRow = (row: ProjectRow): ProjectSummary => {
  const document = toProjectDocumentFromRow(row);
  return {
    arenaWinnerBranchKey: document.arenaWinnerBranchKey,
    arenaWinnerSessionId: document.arenaWinnerSessionId,
    createdAt: document.createdAt,
    id: document.id,
    memoryIds: document.memoryIds,
    sessionCount: document.sessionCount,
    title: document.title,
    updatedAt: document.updatedAt,
  };
};

type MemoryRow = {
  content: string;
  created_at: string;
  id: string;
  owner_id: string;
  source_keys: unknown;
  source_kind: string | null;
  source_project_id: string | null;
  source_session_id: string | null;
  title: string;
  type: string;
  updated_at: string;
};

export const toMemoryItemFromRow = (row: MemoryRow): ProjectMemoryItem => {
  const item = normalizeProjectMemoryItem({
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    sourceProjectId: row.source_project_id,
    sourceKeys: row.source_keys,
    sourceKind: row.source_kind,
    sourceSessionId: row.source_session_id,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
  });
  if (!item) {
    throw new Error(`Invalid memory row: ${row.id}`);
  }
  return item;
};
