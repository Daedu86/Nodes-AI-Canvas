import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getSessionArtifactMaxBlobBytes,
  getSessionArtifactStorageQuotaBytes,
} from "@/lib/artifact-upload-policy";
import { getPersistenceBackend } from "@/lib/persistence/backend";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { readSupabasePersistenceConfig } from "@/lib/persistence/supabase/config";
import type { SessionArtifact } from "@/lib/session-artifacts";

export type SessionBlobEntry = {
  absolutePath: string;
  blobRef: string;
  byteSize: number;
  createdAt?: string | null;
  mimeType?: string | null;
};

export type SessionBlobMaintenance = {
  deduplicatedBlobLinks: number;
  failedDeleteCount?: number;
  missingBlobCount?: number;
  orphanBlobCount: number;
  orphanBytes: number;
  pendingDeleteCount?: number;
  pendingUploadCount?: number;
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

type SupabaseBlobStateCounts = {
  failedDeleteCount: number;
  pendingDeleteCount: number;
  pendingUploadCount: number;
};

type ClaimedBlobDeletion = {
  attempt: number;
  blob_ref: string;
  bucket_id: string;
  byte_size: number | string;
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

const getContentHashFromBlobRef = (blobRef: string) => blobRef.split("/").at(-1) ?? blobRef;

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
        createdAt: stats.birthtime.toISOString(),
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
  stateCounts: SupabaseBlobStateCounts = {
    failedDeleteCount: 0,
    pendingDeleteCount: 0,
    pendingUploadCount: 0,
  },
): SessionBlobMaintenance => {
  const references = referencedBlobRefs.filter(Boolean);
  const uniqueReferencedBlobRefs = new Set(references);
  const existingRefs = new Set(blobEntries.map((entry) => entry.blobRef));
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
  const missingBlobCount = [...uniqueReferencedBlobRefs].filter((ref) => !existingRefs.has(ref)).length;
  return {
    deduplicatedBlobLinks: Math.max(0, references.length - uniqueReferencedBlobRefs.size),
    failedDeleteCount: stateCounts.failedDeleteCount,
    missingBlobCount,
    orphanBlobCount,
    orphanBytes,
    pendingDeleteCount: stateCounts.pendingDeleteCount,
    pendingUploadCount: stateCounts.pendingUploadCount,
    referencedBlobCount,
    referencedBlobLinks: references.length,
    referencedBytes,
    totalBlobCount: blobEntries.length,
    totalBytes,
    uniqueReferencedBlobCount: uniqueReferencedBlobRefs.size,
  };
};

const emptyBlobMaintenance = (): SessionBlobMaintenance =>
  buildMaintenanceSummary([], []);

const emptyBlobCleanup = (): SessionBlobCleanupResult => ({
  deletedBlobCount: 0,
  deletedBytes: 0,
  maintenance: emptyBlobMaintenance(),
});

async function saveFileSessionArtifactBlob(input: {
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
    storageQuotaBytes: null,
    storageUsedBytes: null,
  };
}

const isStorageConflict = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    error?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status = Number(value.status ?? value.statusCode);
  return (
    status === 409 ||
    value.error === "ResourceAlreadyExists" ||
    value.error === "KeyAlreadyExists"
  );
};

async function registerSupabaseBlob(input: {
  blobRef: string;
  byteSize: number;
  fileName: string;
  mimeType?: string | null;
  ownerId: string;
  sessionId: string;
}) {
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();
  const storageQuotaBytes = getSessionArtifactStorageQuotaBytes();
  const { data, error } = await client.rpc("register_session_blob_upload", {
    p_blob_ref: input.blobRef,
    p_bucket_id: storageBucket,
    p_byte_size: input.byteSize,
    p_content_hash: getContentHashFromBlobRef(input.blobRef),
    p_max_blob_bytes: getSessionArtifactMaxBlobBytes(),
    p_mime_type: input.mimeType ?? "",
    p_now: new Date().toISOString(),
    p_original_file_name: input.fileName,
    p_owner_id: input.ownerId,
    p_owner_quota_bytes: storageQuotaBytes,
    p_session_id: input.sessionId,
  });
  if (error) {
    throw new Error(error.message || "Failed to register artifact blob");
  }
  const row = Array.isArray(data)
    ? (data[0] as { storage_used_bytes?: number | string } | undefined)
    : undefined;
  return {
    storageQuotaBytes,
    storageUsedBytes: Number(row?.storage_used_bytes ?? input.byteSize),
  };
}

async function saveSupabaseSessionArtifactBlob(input: {
  sessionId: string;
  ownerId?: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string | null;
}) {
  ensureSafeSessionId(input.sessionId);
  if (!input.ownerId) {
    throw new Error("An authenticated owner is required for cloud artifact storage");
  }
  const blobRef = buildBlobRef(input.sessionId, input.bytes);
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();

  const uploadResult = await client.storage
    .from(storageBucket)
    .upload(blobRef, input.bytes, {
      upsert: false,
      contentType: input.mimeType ?? undefined,
    });
  const deduplicated = isStorageConflict(uploadResult.error);
  if (uploadResult.error && !deduplicated) {
    throw new Error(uploadResult.error.message || "Failed to upload artifact blob");
  }

  try {
    const registration = await registerSupabaseBlob({
      blobRef,
      byteSize: input.bytes.byteLength,
      fileName: input.fileName,
      mimeType: input.mimeType,
      ownerId: input.ownerId,
      sessionId: input.sessionId,
    });
    return {
      absolutePath: `supabase://${storageBucket}/${blobRef}`,
      blobRef,
      deduplicated,
      ...registration,
    };
  } catch (error) {
    if (!deduplicated) {
      await client.storage.from(storageBucket).remove([blobRef]).catch(() => {});
    }
    throw error;
  }
}

export async function saveSessionArtifactBlob(input: {
  sessionId: string;
  ownerId?: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string | null;
}) {
  return getPersistenceBackend() === "supabase"
    ? saveSupabaseSessionArtifactBlob(input)
    : saveFileSessionArtifactBlob(input);
}

async function deleteFileSessionArtifactBlob(blobRef: string) {
  await fs.rm(getBlobAbsolutePath(blobRef), { force: true });
}

async function deleteSupabaseSessionArtifactBlob(blobRef: string) {
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();
  const { error } = await client.storage.from(storageBucket).remove([blobRef]);
  if (error) {
    throw new Error(error.message || "Failed to delete artifact blob");
  }
}

export async function deleteSessionArtifactBlob(blobRef: string | null | undefined) {
  if (!blobRef) return;
  ensureSafeBlobRef(blobRef);
  if (getPersistenceBackend() === "supabase") {
    await deleteSupabaseSessionArtifactBlob(blobRef);
    return;
  }
  await deleteFileSessionArtifactBlob(blobRef);
}

async function deleteFileSessionBlobDir(sessionId: string) {
  ensureSafeSessionId(sessionId);
  await fs.rm(path.join(getSessionBlobStoreDir(), sessionId), { recursive: true, force: true });
}

async function deleteSupabaseSessionBlobDir(sessionId: string) {
  ensureSafeSessionId(sessionId);
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();
  const refs: string[] = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await client.storage.from(storageBucket).list(sessionId, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message || "Failed to list session artifact blobs");
    }
    const page = data ?? [];
    refs.push(
      ...page
        .map((entry) => entry.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .map((name) => `${sessionId}/${name}`),
    );
    if (page.length < limit) break;
  }
  for (let index = 0; index < refs.length; index += 1000) {
    const removeResult = await client.storage.from(storageBucket).remove(refs.slice(index, index + 1000));
    if (removeResult.error) {
      throw new Error(removeResult.error.message || "Failed to delete session artifact blobs");
    }
  }
}

export async function deleteSessionBlobDir(sessionId: string) {
  if (getPersistenceBackend() === "supabase") {
    await deleteSupabaseSessionBlobDir(sessionId);
    return;
  }
  await deleteFileSessionBlobDir(sessionId);
}

async function listSupabaseSessionArtifactBlobs(): Promise<SessionBlobEntry[]> {
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();
  const { data, error } = await client.rpc("list_session_artifact_storage_objects", {
    p_bucket_id: storageBucket,
  });
  if (error) {
    throw new Error(error.message || "Failed to list cloud artifact blobs");
  }
  return (Array.isArray(data) ? data : []).map((row) => {
    const item = row as {
      blob_ref?: unknown;
      byte_size?: unknown;
      created_at?: unknown;
      mime_type?: unknown;
    };
    const blobRef = String(item.blob_ref ?? "");
    return {
      absolutePath: `supabase://${storageBucket}/${blobRef}`,
      blobRef,
      byteSize: Number(item.byte_size ?? 0),
      createdAt: typeof item.created_at === "string" ? item.created_at : null,
      mimeType: typeof item.mime_type === "string" ? item.mime_type : null,
    };
  }).filter((entry) => entry.blobRef.length > 0);
}

export async function listSessionArtifactBlobs() {
  if (getPersistenceBackend() === "supabase") {
    return listSupabaseSessionArtifactBlobs();
  }
  const blobStoreDir = getSessionBlobStoreDir();
  await fs.mkdir(blobStoreDir, { recursive: true });
  return listBlobEntriesRecursive(blobStoreDir);
}

async function getSupabaseBlobStateCounts(): Promise<SupabaseBlobStateCounts> {
  const client = getSupabasePersistenceClient();
  const { data, error } = await client.from("session_blobs").select("state");
  if (error) {
    throw new Error(error.message || "Failed to read artifact blob states");
  }
  return (data ?? []).reduce<SupabaseBlobStateCounts>(
    (counts, row) => {
      if (row.state === "pending") counts.pendingUploadCount += 1;
      if (row.state === "deleting") counts.pendingDeleteCount += 1;
      if (row.state === "delete_failed") counts.failedDeleteCount += 1;
      return counts;
    },
    { failedDeleteCount: 0, pendingDeleteCount: 0, pendingUploadCount: 0 },
  );
}

export async function getSessionBlobMaintenance(
  referencedBlobRefs: string[],
): Promise<SessionBlobMaintenance> {
  const blobEntries = await listSessionArtifactBlobs();
  const stateCounts = getPersistenceBackend() === "supabase"
    ? await getSupabaseBlobStateCounts()
    : undefined;
  return buildMaintenanceSummary(blobEntries, referencedBlobRefs, stateCounts);
}

const completeSupabaseDeletion = async (
  blobRef: string,
  success: boolean,
  errorMessage?: string,
) => {
  const client = getSupabasePersistenceClient();
  const result = await client.rpc("complete_session_blob_deletion", {
    p_blob_ref: blobRef,
    p_error: errorMessage ?? null,
    p_now: new Date().toISOString(),
    p_retry_seconds: 300,
    p_success: success,
  });
  if (result.error) {
    throw new Error(result.error.message || "Failed to complete artifact deletion");
  }
};

export async function processSessionBlobDeleteQueue(options: {
  limit?: number;
  scanStorage?: boolean;
} = {}) {
  if (getPersistenceBackend() !== "supabase") {
    return { claimedBlobCount: 0, deletedBlobCount: 0, deletedBytes: 0, failedBlobCount: 0 };
  }
  const client = getSupabasePersistenceClient();
  const { storageBucket } = readSupabasePersistenceConfig();
  const { data, error } = await client.rpc("claim_session_blob_deletions", {
    p_bucket_id: storageBucket,
    p_limit: options.limit ?? 100,
    p_now: new Date().toISOString(),
    p_pending_grace_seconds: 3600,
    p_processing_timeout_seconds: 600,
    p_scan_storage: options.scanStorage === true,
  });
  if (error) {
    throw new Error(error.message || "Failed to claim artifact deletions");
  }
  const claimed = (Array.isArray(data) ? data : []) as ClaimedBlobDeletion[];
  let deletedBlobCount = 0;
  let deletedBytes = 0;
  let failedBlobCount = 0;

  const byBucket = new Map<string, ClaimedBlobDeletion[]>();
  for (const item of claimed) {
    const bucketItems = byBucket.get(item.bucket_id) ?? [];
    bucketItems.push(item);
    byBucket.set(item.bucket_id, bucketItems);
  }

  for (const [bucketId, items] of byBucket) {
    for (let index = 0; index < items.length; index += 1000) {
      const batch = items.slice(index, index + 1000);
      const removeResult = await client.storage
        .from(bucketId)
        .remove(batch.map((item) => item.blob_ref));
      if (removeResult.error) {
        failedBlobCount += batch.length;
        await Promise.all(
          batch.map((item) =>
            completeSupabaseDeletion(item.blob_ref, false, removeResult.error?.message),
          ),
        );
        continue;
      }
      deletedBlobCount += batch.length;
      deletedBytes += batch.reduce((sum, item) => sum + Number(item.byte_size ?? 0), 0);
      await Promise.all(
        batch.map((item) => completeSupabaseDeletion(item.blob_ref, true)),
      );
    }
  }

  return {
    claimedBlobCount: claimed.length,
    deletedBlobCount,
    deletedBytes,
    failedBlobCount,
  };
}

export async function cleanupOrphanedSessionBlobs(
  referencedBlobRefs: string[],
): Promise<SessionBlobCleanupResult> {
  if (getPersistenceBackend() === "supabase") {
    let deletedBlobCount = 0;
    let deletedBytes = 0;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const result = await processSessionBlobDeleteQueue({
        limit: 1000,
        scanStorage: iteration === 0,
      });
      deletedBlobCount += result.deletedBlobCount;
      deletedBytes += result.deletedBytes;
      if (result.claimedBlobCount < 1000) break;
    }
    return {
      deletedBlobCount,
      deletedBytes,
      maintenance: await getSessionBlobMaintenance(referencedBlobRefs),
    };
  }

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
  if (getPersistenceBackend() === "supabase") {
    return;
  }
  const nextRefs = new Set(nextArtifacts.map((artifact) => artifact.blobRef).filter(Boolean));
  const staleRefs = previousArtifacts
    .map((artifact) => artifact.blobRef)
    .filter((blobRef): blobRef is string => Boolean(blobRef) && !nextRefs.has(blobRef));

  await Promise.all(staleRefs.map((blobRef) => deleteSessionArtifactBlob(blobRef)));
}

export const __emptyBlobCleanupForTests = emptyBlobCleanup;
