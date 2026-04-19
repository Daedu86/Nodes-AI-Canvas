import type { SessionRepository } from "@/lib/persistence/session-repository";
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
  deleteSessionBlobDir,
  getSessionBlobMaintenance,
  reconcileSessionArtifactBlobs,
} from "@/lib/session-blob-store";

const sessionSelect =
  "id,title,archived,snapshot_json,artifacts_json,context_links_json,created_at,updated_at";

const isMissingSessionError = (error: unknown) =>
  error instanceof Error && error.message === "Session not found";

export const supabaseSessionRepository: SessionRepository = {
  async listSessions(options = {}) {
    const client = getSupabasePersistenceClient();
    const ownerId = requireOwnerId(options.ownerId);
    let query = client
      .from("sessions")
      .select(sessionSelect)
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
      .select(sessionSelect)
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
      snapshot_json: normalizeSessionThreadExport(
        input.snapshot ?? EMPTY_SESSION_THREAD_EXPORT,
      ),
      artifacts_json: normalizeSessionArtifactsDocument(input.artifacts),
      context_links_json: normalizeSessionContextLinksDocument(input.contextLinks),
    };

    const { data, error } = await client
      .from("sessions")
      .insert(payload)
      .select(sessionSelect)
      .single();

    const row = ensureData(data, error, "Failed to create session");
    return toSessionDocumentFromRow(row);
  },

  async patchSession(sessionId, patch, ownerId) {
    const client = getSupabasePersistenceClient();
    const current = await this.getSession(sessionId, ownerId);
    const update: Record<string, unknown> = {};
    if (patch.archived !== undefined) update.archived = patch.archived;
    if (patch.title !== undefined) {
      update.title =
        typeof patch.title === "string" && patch.title.trim().length > 0
          ? patch.title.trim()
          : null;
    }
    if (patch.snapshot !== undefined) update.snapshot_json = normalizeSessionThreadExport(patch.snapshot);
    if (patch.artifacts !== undefined) update.artifacts_json = normalizeSessionArtifactsDocument(patch.artifacts);
    if (patch.contextLinks !== undefined) {
      update.context_links_json = normalizeSessionContextLinksDocument(patch.contextLinks);
    }

    const { data, error } = await client
      .from("sessions")
      .update(update)
      .eq("id", sessionId)
      .eq("owner_id", requireOwnerId(ownerId))
      .select(sessionSelect)
      .maybeSingle();

    const row = ensureData(data, error, "Session not found");
    const next = toSessionDocumentFromRow(row);
    if (patch.artifacts !== undefined) {
      await reconcileSessionArtifactBlobs(current.artifacts, next.artifacts);
    }
    return next;
  },

  async deleteSession(sessionId, ownerId) {
    const client = getSupabasePersistenceClient();
    await this.getSession(sessionId, ownerId);
    const { error } = await client
      .from("sessions")
      .delete()
      .eq("id", sessionId)
      .eq("owner_id", requireOwnerId(ownerId));
    if (error) {
      throw new Error(error.message || "Failed to delete session");
    }
    await deleteSessionBlobDir(sessionId);
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
    return getSessionBlobMaintenance([]);
  },

  async cleanupBlobStore() {
    return {
      deletedBlobCount: 0,
      deletedBytes: 0,
      maintenance: await getSessionBlobMaintenance([]),
    };
  },
};
