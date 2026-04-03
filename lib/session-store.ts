import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  EMPTY_SESSION_THREAD_EXPORT,
  getSessionMessageCount,
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
  type SessionDocument,
  type SessionSummary,
  type SessionThreadExport,
} from "@/lib/session-documents";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import {
  cleanupOrphanedSessionBlobs,
  deleteSessionBlobDir,
  getSessionBlobMaintenance,
  reconcileSessionArtifactBlobs,
} from "@/lib/session-blob-store";

type StoredSession = Omit<SessionDocument, "messageCount"> & {
  ownerId: string | null;
};

type SessionPatch = {
  archived?: boolean;
  artifacts?: SessionArtifact[];
  contextLinks?: SessionContextLink[];
  snapshot?: SessionThreadExport;
  title?: string | null;
};

const SESSION_FILE_EXTENSION = ".json";

const ensureSafeSessionId = (sessionId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
};

const getSessionStoreDir = () =>
  process.env.SESSION_STORE_DIR
    ? path.resolve(process.env.SESSION_STORE_DIR)
    : path.join(process.cwd(), "data", "sessions");

const getSessionFilePath = (sessionId: string) => {
  ensureSafeSessionId(sessionId);
  return path.join(getSessionStoreDir(), `${sessionId}${SESSION_FILE_EXTENSION}`);
};

const normalizeOwnerId = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const toStoredSession = (
  session: SessionDocument,
  ownerId: string | null,
): StoredSession => {
  const { messageCount, ...storedSession } = session;
  void messageCount;
  return {
    ...storedSession,
    ownerId,
  };
};

const toSessionDocument = (storedSession: StoredSession): SessionDocument => {
  const { ownerId, ...session } = storedSession;
  void ownerId;
  const snapshot = normalizeSessionThreadExport(session.snapshot);
  return {
    ...session,
    snapshot,
    artifacts: normalizeSessionArtifactsDocument(session.artifacts),
    contextLinks: normalizeSessionContextLinksDocument(session.contextLinks),
    messageCount: getSessionMessageCount(snapshot),
  };
};

const sortSessions = (sessions: SessionSummary[]) =>
  [...sessions].sort((a, b) => {
    const timeDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (timeDelta !== 0) return timeDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });

async function ensureStoreDir() {
  await fs.mkdir(getSessionStoreDir(), { recursive: true });
}

async function writeSessionDocument(session: StoredSession) {
  await ensureStoreDir();
  const filePath = getSessionFilePath(session.id);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(session, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readSessionDocumentFromPath(filePath: string): Promise<StoredSession> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoredSession>;
  const snapshot = normalizeSessionThreadExport(parsed.snapshot);
  return toStoredSession(toSessionDocument({
    id: typeof parsed.id === "string" ? parsed.id : path.basename(filePath, SESSION_FILE_EXTENSION),
    title: typeof parsed.title === "string" && parsed.title.trim().length ? parsed.title.trim() : null,
    archived: parsed.archived === true,
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.length
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.length
        ? parsed.updatedAt
        : new Date().toISOString(),
    ownerId: normalizeOwnerId(parsed.ownerId),
    snapshot,
    artifacts: normalizeSessionArtifactsDocument(parsed.artifacts),
    contextLinks: normalizeSessionContextLinksDocument(parsed.contextLinks),
  }), normalizeOwnerId(parsed.ownerId));
}

async function readAllSessionDocuments() {
  await ensureStoreDir();
  const entries = await fs.readdir(getSessionStoreDir(), { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(SESSION_FILE_EXTENSION))
      .map((entry) => readSessionDocumentFromPath(path.join(getSessionStoreDir(), entry.name))),
  );
}

async function claimSessionOwnerIfNeeded(session: StoredSession, ownerId: string) {
  if (session.ownerId === ownerId) {
    return session;
  }
  if (session.ownerId) {
    return null;
  }
  const claimed = {
    ...session,
    ownerId,
  };
  await writeSessionDocument(claimed);
  return claimed;
}

async function getStoredSession(sessionId: string, ownerId?: string) {
  const session = await readSessionDocumentFromPath(getSessionFilePath(sessionId));
  if (!ownerId) {
    return session;
  }
  const claimed = await claimSessionOwnerIfNeeded(session, ownerId);
  if (!claimed) {
    throw new Error("Session not found");
  }
  return claimed;
}

async function getReferencedBlobRefs() {
  const sessions = await readAllSessionDocuments();
  return sessions.flatMap((session) =>
    session.artifacts
      .map((artifact) => artifact.blobRef)
      .filter((blobRef): blobRef is string => Boolean(blobRef)),
  );
}

export async function listSessions(options: { includeArchived?: boolean; ownerId?: string } = {}) {
  const includeArchived = options.includeArchived === true;
  const ownerId = typeof options.ownerId === "string" && options.ownerId.length > 0
    ? options.ownerId
    : null;
  let sessions = await readAllSessionDocuments();

  if (ownerId) {
    const visibleSessions: StoredSession[] = [];
    for (const session of sessions) {
      const claimed = await claimSessionOwnerIfNeeded(session, ownerId);
      if (claimed) {
        visibleSessions.push(claimed);
      }
    }
    sessions = visibleSessions;
  }

  const summaries = sessions
    .filter((session) => includeArchived || !session.archived)
    .map<SessionSummary>((storedSession) => {
      const { ownerId, snapshot, ...session } = storedSession;
      void ownerId;
      return {
        ...session,
        messageCount: getSessionMessageCount(snapshot),
      };
    });

  return sortSessions(summaries);
}

export async function getSession(sessionId: string, ownerId?: string) {
  return toSessionDocument(await getStoredSession(sessionId, ownerId));
}

export async function createSession(input: {
  artifacts?: SessionArtifact[];
  contextLinks?: SessionContextLink[];
  ownerId?: string;
  snapshot?: SessionThreadExport;
  title?: string | null;
} = {}) {
  const now = new Date().toISOString();
  const session: StoredSession = {
    id: randomUUID(),
    title: typeof input.title === "string" && input.title.trim().length ? input.title.trim() : null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ownerId: normalizeOwnerId(input.ownerId),
    snapshot: normalizeSessionThreadExport(input.snapshot ?? EMPTY_SESSION_THREAD_EXPORT),
    artifacts: normalizeSessionArtifactsDocument(input.artifacts),
    contextLinks: normalizeSessionContextLinksDocument(input.contextLinks),
  };
  await writeSessionDocument(session);
  return toSessionDocument(session);
}

export async function patchSession(sessionId: string, patch: SessionPatch, ownerId?: string) {
  const current = await getStoredSession(sessionId, ownerId);
  const next: StoredSession = {
    id: current.id,
    title:
      patch.title === undefined
        ? current.title
        : typeof patch.title === "string" && patch.title.trim().length
          ? patch.title.trim()
          : null,
    archived: patch.archived ?? current.archived,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    ownerId: current.ownerId,
    snapshot:
      patch.snapshot === undefined
        ? current.snapshot
        : normalizeSessionThreadExport(patch.snapshot),
    artifacts:
      patch.artifacts === undefined
        ? current.artifacts
        : normalizeSessionArtifactsDocument(patch.artifacts),
    contextLinks:
      patch.contextLinks === undefined
        ? current.contextLinks
        : normalizeSessionContextLinksDocument(patch.contextLinks),
  };
  await reconcileSessionArtifactBlobs(current.artifacts, next.artifacts);
  await writeSessionDocument(next);
  return toSessionDocument(next);
}

export async function deleteSession(sessionId: string, ownerId?: string) {
  const session = await getStoredSession(sessionId, ownerId);
  const filePath = getSessionFilePath(session.id);
  await fs.rm(filePath, { force: true });
  await deleteSessionBlobDir(session.id);
}

export async function deleteSessions(sessionIds: string[], ownerId?: string) {
  const uniqueSessionIds = [...new Set(sessionIds)];
  await Promise.all(uniqueSessionIds.map((sessionId) => deleteSession(sessionId, ownerId)));
}

export async function getSessionBlobMaintenanceSummary() {
  return getSessionBlobMaintenance(await getReferencedBlobRefs());
}

export async function cleanupSessionBlobStore() {
  return cleanupOrphanedSessionBlobs(await getReferencedBlobRefs());
}
