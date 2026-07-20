import type { SessionRepository } from "@/lib/persistence/session-repository";
import { CURRENT_SESSION_SCHEMA_VERSION } from "@/lib/persistence/session-schema-version";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import {
  ensureData,
  requireOwnerId,
  toSessionDocumentFromRow,
  toSessionSummaryFromRow,
} from "@/lib/persistence/supabase/shared";
import {
  EMPTY_SESSION_THREAD_EXPORT,
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
} from "@/lib/session-documents";
import {
  cleanupOrphanedSessionBlobs,
  getSessionBlobMaintenance,
  processSessionBlobDeleteQueue,
} from "@/lib/session-blob-store";
import {
  isValidSessionVersion,
  SessionVersionConflictError,
} from "@/lib/session-version-conflict";

const sessionDocumentSelect =
  "id,title,archived,version,schema_version,message_count,snapshot_json,artifacts_json,context_links_json,created_at,updated_at";
const sessionSummarySelect =
  "id,title,archived,version,schema_version,message_count,created_at,updated_at";

const isMissingSessionError = (error: unknown) =>
  error instanceof Error && error.message === "Session not found";

const toCanonicalJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(toCanonicalJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, toCanonicalJsonValue(entry)]),
    );
  }
  return value;
};

const isStructurallyEqual = (left: unknown, right: unknown) =>
  JSON.stringify(toCanonicalJsonValue(left)) ===
  JSON.stringify(toCanonicalJsonValue(right));

const processBlobQueueBestEffort = async () => {
  try {
    await processSessionBlobDeleteQueue({ limit: 100, scanStorage: false });
  } catch (error) {
    console.error("Failed to process queued artifact deletions", error);
  }
};

const getReferencedBlobRefs = async () => {
  const client = getSupabasePersistenceClient();
  const { data, error } = await client.from("sessions").select("artifacts_json");
  if (error) {
    throw new Error(error.message || "Failed to read session artifact references");
  }
  return (data ?? []).flatMap((row) =>
    normalizeSessionArtifactsDocument(row.artifacts_json)
      .map((artifact) => artifact.blobRef)
      .filter((blobRef): blobRef is string => Boolean(blobRef)),
  );
};

export const supabaseSessionRepository: SessionRepository = {
  async listSessions(options = {}) {
    const client = getSupabasePersistenceClient();
    const ownerId = requireOwnerId(options.ownerId);
    let query = client
      .from("sessions")
      .select(sessionSummarySelect)
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });

    if (!options.includeArchived) {
      query = query.eq("archived", false);
    }

    const { data, error } = await query;
    const rows = ensureData(data, error, "Failed to list sessions");
    return rows.map(toSessionSummaryFromRow);
  },

  async getSession(sessionId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("sessions")
      .select(sessionDocumentSelect)
      .eq("id", sessionId)
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    const row = ensureData(data, error, "Session not found");
    return toSessionDocumentFromRow(row);
  },

  async createSession(input = {}) {
    const client = getSupabasePersistenceClient();
    const ownerId = requireOwnerId(input.ownerId);
    const payload = {
      owner_id: ownerId,
      title:
        typeof input.title === "string" && input.title.trim().length > 0
          ? input.title.trim()
          : null,
      archived: false,
      version: 1,
      schema_version: CURRENT_SESSION_SCHEMA_VERSION,
      snapshot_json: normalizeSessionThreadExport(
        input.snapshot ?? EMPTY_SESSION_THREAD_EXPORT,
      ),
      artifacts_json: normalizeSessionArtifactsDocument(input.artifacts),
      context_links_json: normalizeSessionContextLinksDocument(input.contextLinks),
    };

    const { data, error } = await client
      .from("sessions")
      .insert(payload)
      .select(sessionDocumentSelect)
      .single();

    const row = ensureData(data, error, "Failed to create session");
    return toSessionDocumentFromRow(row);
  },

  async patchSession(sessionId, patch, options) {
    const client = getSupabasePersistenceClient();
    const ownerId = requireOwnerId(options.ownerId);
    if (!isValidSessionVersion(options.expectedVersion)) {
      throw new Error("A positive expected session version is required.");
    }

    const current = await this.getSession(sessionId, ownerId);
    if (current.version !== options.expectedVersion) {
      throw new SessionVersionConflictError(options.expectedVersion, current);
    }

    const patchPayload: Record<string, unknown> = {};
    if (patch.archived !== undefined && patch.archived !== current.archived) {
      patchPayload.archived = patch.archived;
    }
    if (patch.title !== undefined && patch.title !== current.title) {
      patchPayload.title = patch.title;
    }
    if (patch.snapshot !== undefined) {
      const normalizedSnapshot = normalizeSessionThreadExport(patch.snapshot);
      if (!isStructurallyEqual(normalizedSnapshot, current.snapshot)) {
        patchPayload.snapshot = normalizedSnapshot;
      }
    }
    if (patch.artifacts !== undefined) {
      const normalizedArtifacts = normalizeSessionArtifactsDocument(patch.artifacts);
      if (!isStructurallyEqual(normalizedArtifacts, current.artifacts)) {
        patchPayload.artifacts = normalizedArtifacts;
      }
    }
    if (patch.contextLinks !== undefined) {
      const normalizedContextLinks = normalizeSessionContextLinksDocument(patch.contextLinks);
      if (!isStructurallyEqual(normalizedContextLinks, current.contextLinks)) {
        patchPayload.contextLinks = normalizedContextLinks;
      }
    }

    const hasDocumentPatch =
      patchPayload.snapshot !== undefined ||
      patchPayload.artifacts !== undefined ||
      patchPayload.contextLinks !== undefined;
    if (hasDocumentPatch) {
      patchPayload.schemaVersion = CURRENT_SESSION_SCHEMA_VERSION;
    }

    // A no-op patch must not call the versioned reconciliation RPC. Doing so
    // increments the session version even though the document did not change,
    // which can feed a client persistence acknowledgement loop indefinitely.
    if (Object.keys(patchPayload).length === 0) {
      return current;
    }

    const { data, error } = await client.rpc("patch_session_with_blob_reconciliation", {
      p_expected_version: options.expectedVersion,
      p_now: new Date().toISOString(),
      p_owner_id: ownerId,
      p_patch: patchPayload,
      p_session_id: sessionId,
    });
    if (error) {
      throw new Error(error.message || "Failed to update session");
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      const latest = await this.getSession(sessionId, ownerId);
      throw new SessionVersionConflictError(options.expectedVersion, latest);
    }

    const next = toSessionDocumentFromRow(row);
    if (patch.artifacts !== undefined) {
      await processBlobQueueBestEffort();
    }
    return next;
  },

  async deleteSession(sessionId, ownerId) {
    const client = getSupabasePersistenceClient();
    const normalizedOwnerId = requireOwnerId(ownerId);
    const { data, error } = await client.rpc("delete_session_with_blob_reconciliation", {
      p_now: new Date().toISOString(),
      p_owner_id: normalizedOwnerId,
      p_session_id: sessionId,
    });
    if (error) {
      throw new Error(error.message || "Failed to delete session");
    }
    if (data !== true) {
      throw new Error("Session not found");
    }
    await processBlobQueueBestEffort();
  },

  async deleteSessions(sessionIds, ownerId) {
    const uniqueIds = [...new Set(sessionIds)];
    await Promise.all(uniqueIds.map(async (sessionId) => {
      try {
        await this.deleteSession(sessionId, ownerId);
      } catch (error) {
        if (!isMissingSessionError(error)) {
          throw error;
        }
      }
    }));
  },

  async getSessionBlobMaintenanceSummary() {
    return getSessionBlobMaintenance(await getReferencedBlobRefs());
  },

  async cleanupBlobStore() {
    return cleanupOrphanedSessionBlobs(await getReferencedBlobRefs());
  },
};