import {
  normalizeSessionArtifacts,
  normalizeSessionContextLinks,
  type SessionArtifact,
  type SessionContextLink,
} from "@/lib/session-artifacts";

export type SessionThreadExportMessage = {
  message: Record<string, unknown>;
  parentId: string | null;
};

export type SessionThreadExport = {
  headId?: string | null;
  messages: SessionThreadExportMessage[];
};

export type SessionSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  messageCount: number;
  version?: number;
};

export type SessionDocument = SessionSummary & {
  version: number;
  snapshot: SessionThreadExport;
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
};

export const EMPTY_SESSION_THREAD_EXPORT: SessionThreadExport = {
  headId: null,
  messages: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isSessionThreadExport = (value: unknown): value is SessionThreadExport => {
  if (!isRecord(value)) return false;
  if ("headId" in value && value.headId !== null && typeof value.headId !== "string") {
    return false;
  }
  if (!Array.isArray(value.messages)) return false;
  return value.messages.every((entry) => {
    if (!isRecord(entry)) return false;
    if (entry.parentId !== null && typeof entry.parentId !== "string") return false;
    return isRecord(entry.message);
  });
};

export const normalizeSessionThreadExport = (
  value: unknown,
): SessionThreadExport => {
  if (!isSessionThreadExport(value)) {
    return EMPTY_SESSION_THREAD_EXPORT;
  }
  return {
    headId: typeof value.headId === "string" ? value.headId : null,
    messages: value.messages.map((entry) => ({
      message: entry.message,
      parentId: entry.parentId,
    })),
  };
};

export const getSessionMessageCount = (snapshot: SessionThreadExport) => snapshot.messages.length;

export const normalizeSessionArtifactsDocument = (value: unknown) =>
  normalizeSessionArtifacts(value);

export const normalizeSessionContextLinksDocument = (value: unknown) =>
  normalizeSessionContextLinks(value);
