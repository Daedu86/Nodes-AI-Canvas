import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SessionArtifact } from "@/lib/session-artifacts";

export type SessionBlobEntry = {
  absolutePath: string;
  blobRef: string;
  byteSize: number;
};

export type SessionBlobMaintenance = {
  deduplicatedBlobLinks: number;
  orphanBlobCount: number;
  orphanBytes: number;
  referencedBlobCount: number;
  referencedBlobLinks: number;
  referencedBytes: number;
  totalBlobCount: number;
  totalBytes: number;
  uniqueReferencedBlobCount: number;
};

export type SessionBlobCleanupResult = {
  deletedBlobCount: number;
  deletedBytes: number;
  maintenance: SessionBlobMaintenance;
};

const ensureSafeSessionId = (sessionId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
};

const ensureSafeBlobRef = (blobRef: string) => {
  if (blobRef.length === 0 || blobRef.includes("..") || path.isAbsolute(blobRef)) {
    throw new Error(`Invalid blob ref: ${blobRef}`);
  }
};

const buildBlobRef = (sessionId: string, bytes: Uint8Array) => {
  const contentHash = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  return `${sessionId}/${contentHash}`;
};

export const getSessionBlobStoreDir = () =>
  process.env.SESSION_BLOB_STORE_DIR
    ? path.resolve(process.env.SESSION_BLOB_STORE_DIR)
    : path.join(process.cwd(), "data", "session-blobs");

const getBlobAbsolutePath = (blobRef: string) => {
  ensureSafeBlobRef(blobRef);
  const blobStoreDir = getSessionBlobStoreDir();
  const absolutePath = path.resolve(blobStoreDir, blobRef);
  const normalizedRoot = `${blobStoreDir}${path.sep}`;
  if (absolutePath !== blobStoreDir && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error(`Blob ref escapes store root: ${blobRef}`);
  }
  return absolutePath;
};

const listBlobEntriesRecursive = async (
  absoluteDir: string,
  relativeDir = "",
): Promise<SessionBlobEntry[]> => {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const nextAbsolutePath = path.join(absoluteDir, entry.name);
      const nextRelativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        return listBlobEntriesRecursive(nextAbsolutePath, nextRelativePath);
      }
      if (!entry.isFile()) return [];
      const stats = await fs.stat(nextAbsolutePath);
      return [{
        absolutePath: nextAbsolutePath,
        blobRef: nextRelativePath.split(path.sep).join("/"),
        byteSize: stats.size,
      } satisfies SessionBlobEntry];
    }),
  );
  return nested.flat();
};

const removeEmptyDirectoriesRecursive = async (absoluteDir: string, isRoot = false) => {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => removeEmptyDirectoriesRecursive(path.join(absoluteDir, entry.name))),
  );
  const afterEntries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  if (!isRoot && afterEntries.length === 0) {
    await fs.rmdir(absoluteDir).catch(() => {});
  }
};

const buildMaintenanceSummary = (
  blobEntries: SessionBlobEntry[],
  referencedBlobRefs: string[],
): SessionBlobMaintenance => {
  const uniqueReferencedBlobRefs = new Set(referencedBlobRefs.filter(Boolean));
  let referencedBlobCount = 0;
  let referencedBytes = 0;
  let orphanBlobCount = 0;
  let orphanBytes = 0;

  blobEntries.forEach((entry) => {
    if (uniqueReferencedBlobRefs.has(entry.blobRef)) {
      referencedBlobCount += 1;
      referencedBytes += entry.byteSize;
      return;
    }
    orphanBlobCount += 1;
    orphanBytes += entry.byteSize;
  });

  const totalBytes = blobEntries.reduce((sum, entry) => sum + entry.byteSize, 0);
  return {
    deduplicatedBlobLinks: Math.max(0, referencedBlobRefs.filter(Boolean).length - uniqueReferencedBlobRefs.size),
    orphanBlobCount,
    orphanBytes,
    referencedBlobCount,
    referencedBlobLinks: referencedBlobRefs.filter(Boolean).length,
    referencedBytes,
    totalBlobCount: blobEntries.length,
    totalBytes,
    uniqueReferencedBlobCount: uniqueReferencedBlobRefs.size,
  };
};

export async function saveSessionArtifactBlob(input: {
  sessionId: string;
  fileName: string;
  bytes: Uint8Array;
}) {
  ensureSafeSessionId(input.sessionId);
  const blobRef = buildBlobRef(input.sessionId, input.bytes);
  const absolutePath = getBlobAbsolutePath(blobRef);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  let deduplicated = false;
  try {
    await fs.access(absolutePath);
    deduplicated = true;
  } catch {
    await fs.writeFile(absolutePath, input.bytes);
  }

  return {
    absolutePath,
    blobRef,
    deduplicated,
  };
}

export async function deleteSessionArtifactBlob(blobRef: string | null | undefined) {
  if (!blobRef) return;
  await fs.rm(getBlobAbsolutePath(blobRef), { force: true });
}

export async function deleteSessionBlobDir(sessionId: string) {
  ensureSafeSessionId(sessionId);
  await fs.rm(path.join(getSessionBlobStoreDir(), sessionId), { recursive: true, force: true });
}

export async function listSessionArtifactBlobs() {
  const blobStoreDir = getSessionBlobStoreDir();
  await fs.mkdir(blobStoreDir, { recursive: true });
  return listBlobEntriesRecursive(blobStoreDir);
}

export async function getSessionBlobMaintenance(
  referencedBlobRefs: string[],
): Promise<SessionBlobMaintenance> {
  const blobEntries = await listSessionArtifactBlobs();
  return buildMaintenanceSummary(blobEntries, referencedBlobRefs);
}

export async function cleanupOrphanedSessionBlobs(
  referencedBlobRefs: string[],
): Promise<SessionBlobCleanupResult> {
  const blobEntries = await listSessionArtifactBlobs();
  const uniqueReferencedBlobRefs = new Set(referencedBlobRefs.filter(Boolean));
  const orphanEntries = blobEntries.filter((entry) => !uniqueReferencedBlobRefs.has(entry.blobRef));

  await Promise.all(orphanEntries.map((entry) => fs.rm(entry.absolutePath, { force: true })));
  await removeEmptyDirectoriesRecursive(getSessionBlobStoreDir(), true);

  return {
    deletedBlobCount: orphanEntries.length,
    deletedBytes: orphanEntries.reduce((sum, entry) => sum + entry.byteSize, 0),
    maintenance: await getSessionBlobMaintenance(referencedBlobRefs),
  };
}

export async function reconcileSessionArtifactBlobs(
  previousArtifacts: SessionArtifact[],
  nextArtifacts: SessionArtifact[],
) {
  const nextRefs = new Set(nextArtifacts.map((artifact) => artifact.blobRef).filter(Boolean));
  const staleRefs = previousArtifacts
    .map((artifact) => artifact.blobRef)
    .filter((blobRef): blobRef is string => Boolean(blobRef) && !nextRefs.has(blobRef));

  await Promise.all(staleRefs.map((blobRef) => deleteSessionArtifactBlob(blobRef)));
}
