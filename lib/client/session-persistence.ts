import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import type {
  SessionDocument,
  SessionSummary,
  SessionThreadExport,
} from "@/lib/session-documents";
import { normalizeSessionThreadExport } from "@/lib/session-documents";
import { SESSION_VERSION_CONFLICT_CODE } from "@/lib/session-version-conflict";
import { fetchJson } from "@/lib/client/persisted-resource-client";

export type ActiveSessionDocumentPatch = {
  artifacts?: SessionArtifact[];
  contextLinks?: SessionContextLink[];
  snapshot?: SessionThreadExport;
};

export type SessionDocumentPatch = ActiveSessionDocumentPatch & {
  archived?: boolean;
  title?: string | null;
};

export type SessionResponse = {
  session: SessionDocument;
};

export type SessionConflictResponse = SessionResponse & {
  code: typeof SESSION_VERSION_CONFLICT_CODE;
  error: string;
  expectedVersion: number;
};

export type SessionConflictState = {
  attemptedPatch: SessionDocumentPatch;
  currentSession: SessionDocument;
  sessionId: string;
};

const SESSION_SNAPSHOT_CACHE_KEY_PREFIX = "nodes.session-snapshot-cache.v1:";
const KEEPALIVE_SAFE_BODY_BYTES = 60 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const buildSessionSnapshotCacheKey = (sessionId: string) =>
  `${SESSION_SNAPSHOT_CACHE_KEY_PREFIX}${sessionId}`;

export const pickSessionId = (
  sessions: SessionSummary[],
  options?: { excludeIds?: string[]; preferredId?: string | null },
) => {
  const excludeIds = new Set(options?.excludeIds ?? []);
  const available = sessions.filter((session) => !excludeIds.has(session.id));
  const preferredId = options?.preferredId ?? null;
  if (preferredId && available.some((session) => session.id === preferredId)) {
    return preferredId;
  }
  return (
    available.find((session) => !session.archived)?.id ??
    available[0]?.id ??
    null
  );
};

export const readSessionConflictResponse = (
  error: unknown,
): SessionConflictResponse | null => {
  if (!(error instanceof Error) || !("status" in error) || error.status !== 409) {
    return null;
  }
  const payload = "payload" in error ? error.payload : null;
  if (!isRecord(payload) || payload.code !== SESSION_VERSION_CONFLICT_CODE) {
    return null;
  }
  if (!isRecord(payload.session) || typeof payload.session.id !== "string") {
    return null;
  }
  return payload as unknown as SessionConflictResponse;
};

export const parseCachedSessionSnapshot = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { snapshot?: unknown };
    return normalizeSessionThreadExport(parsed.snapshot);
  } catch {
    return null;
  }
};

export const selectRecoverableSessionSnapshot = (
  cachedSnapshot: SessionThreadExport | null,
  currentSnapshot: SessionThreadExport,
) =>
  cachedSnapshot &&
  cachedSnapshot.messages.length > currentSnapshot.messages.length
    ? cachedSnapshot
    : null;

export const readRecoverableSessionSnapshot = (
  sessionId: string,
  currentSnapshot: SessionThreadExport,
) => {
  try {
    const cachedSnapshot = parseCachedSessionSnapshot(
      localStorage.getItem(buildSessionSnapshotCacheKey(sessionId)),
    );
    return selectRecoverableSessionSnapshot(cachedSnapshot, currentSnapshot);
  } catch {
    return null;
  }
};

export const clearSessionSnapshotCache = (sessionId: string) => {
  try {
    localStorage.removeItem(buildSessionSnapshotCacheKey(sessionId));
  } catch {
    // ignore cache errors
  }
};

export const getSessionPatchBodyBytes = (
  patch: SessionDocumentPatch,
  expectedVersion: number,
) =>
  new TextEncoder().encode(
    JSON.stringify({
      ...patch,
      expectedVersion,
    }),
  ).length;

export const shouldKeepaliveSessionPatch = (
  patch: SessionDocumentPatch,
  expectedVersion: number,
) => getSessionPatchBodyBytes(patch, expectedVersion) <= KEEPALIVE_SAFE_BODY_BYTES;

export async function patchSessionRequest(
  sessionId: string,
  patch: SessionDocumentPatch,
  expectedVersion: number,
  options?: { keepalive?: boolean },
) {
  return fetchJson<SessionResponse>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...patch,
      expectedVersion,
    }),
    keepalive: options?.keepalive === true,
  });
}

export async function recoverSessionDocumentFromCache(
  sessionDocument: SessionDocument,
  registerConflict: (
    sessionId: string,
    attemptedPatch: SessionDocumentPatch,
    error: unknown,
  ) => boolean,
) {
  const cachedSnapshot = readRecoverableSessionSnapshot(
    sessionDocument.id,
    sessionDocument.snapshot,
  );
  if (!cachedSnapshot) return sessionDocument;

  const attemptedPatch = { snapshot: cachedSnapshot };
  const localSessionDocument = {
    ...sessionDocument,
    snapshot: cachedSnapshot,
  };

  try {
    const recovered = await patchSessionRequest(
      sessionDocument.id,
      attemptedPatch,
      sessionDocument.version,
      {
        keepalive: shouldKeepaliveSessionPatch(
          attemptedPatch,
          sessionDocument.version,
        ),
      },
    );
    return recovered.session;
  } catch (error) {
    registerConflict(sessionDocument.id, attemptedPatch, error);
    return localSessionDocument;
  }
}
