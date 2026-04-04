import type { MemoryRepository } from "@/lib/persistence/memory-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import {
  ensureData,
  requireOwnerId,
  toMemoryItemFromRow,
} from "@/lib/persistence/supabase/shared";

const memorySelect =
  "id,owner_id,title,content,type,source_project_id,source_session_id,source_kind,source_keys,created_at,updated_at";

export const supabaseMemoryRepository: MemoryRepository = {
  async listMemoryItems(options = {}) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("memory_items")
      .select(memorySelect)
      .eq("owner_id", requireOwnerId(options.ownerId))
      .order("updated_at", { ascending: false });

    const rows = ensureData(data, error, "Failed to list memory");
    return rows.map(toMemoryItemFromRow);
  },

  async getMemoryItem(memoryId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("memory_items")
      .select(memorySelect)
      .eq("id", memoryId)
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    const row = ensureData(data, error, "Memory not found");
    return toMemoryItemFromRow(row);
  },

  async createMemoryItem(input) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("memory_items")
      .insert({
        owner_id: requireOwnerId(input.ownerId),
        title: input.title.trim(),
        content: input.content,
        type: input.type,
        source_project_id: input.sourceProjectId ?? null,
        source_session_id: input.sourceSessionId ?? null,
        source_kind: input.sourceKind ?? null,
        source_keys: Array.isArray(input.sourceKeys)
          ? [...new Set(input.sourceKeys.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
          : [],
      })
      .select(memorySelect)
      .single();

    const row = ensureData(data, error, "Failed to create memory");
    return toMemoryItemFromRow(row);
  },

  async patchMemoryItem(memoryId, patch, ownerId) {
    const client = getSupabasePersistenceClient();
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title?.trim() || null;
    if (patch.content !== undefined) update.content = patch.content;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.sourceProjectId !== undefined) update.source_project_id = patch.sourceProjectId;
    if (patch.sourceSessionId !== undefined) update.source_session_id = patch.sourceSessionId;
    if (patch.sourceKind !== undefined) update.source_kind = patch.sourceKind;
    if (patch.sourceKeys !== undefined) {
      update.source_keys = [...new Set(patch.sourceKeys.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
    }

    const { data, error } = await client
      .from("memory_items")
      .update(update)
      .eq("id", memoryId)
      .eq("owner_id", requireOwnerId(ownerId))
      .select(memorySelect)
      .maybeSingle();

    const row = ensureData(data, error, "Memory not found");
    return toMemoryItemFromRow(row);
  },

  async deleteMemoryItem(memoryId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { error } = await client
      .from("memory_items")
      .delete()
      .eq("id", memoryId)
      .eq("owner_id", requireOwnerId(ownerId));
    if (error) {
      throw new Error(error.message || "Failed to delete memory");
    }
  },

  async deleteMemoryItems(memoryIds, ownerId) {
    const client = getSupabasePersistenceClient();
    const { error } = await client
      .from("memory_items")
      .delete()
      .in("id", [...new Set(memoryIds)])
      .eq("owner_id", requireOwnerId(ownerId));
    if (error) {
      throw new Error(error.message || "Failed to delete memory items");
    }
  },
};
