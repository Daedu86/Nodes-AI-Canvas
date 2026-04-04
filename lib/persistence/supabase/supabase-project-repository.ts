import type { ProjectRepository } from "@/lib/persistence/project-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import {
  ensureData,
  requireOwnerId,
  toProjectDocumentFromRow,
  toProjectSummaryFromRow,
} from "@/lib/persistence/supabase/shared";

const projectSelect = `
  id,
  title,
  global_context,
  arena_winner_session_id,
  arena_winner_branch_key,
  created_at,
  updated_at,
  project_sessions(session_id, position),
  project_memory_links(memory_id)
`;

async function replaceProjectSessionLinks(projectId: string, sessionIds: string[]) {
  const client = getSupabasePersistenceClient();
  await client.from("project_sessions").delete().eq("project_id", projectId);

  if (sessionIds.length === 0) return;

  const rows = sessionIds.map((sessionId, index) => ({
    project_id: projectId,
    session_id: sessionId,
    position: index,
  }));
  const { error } = await client.from("project_sessions").insert(rows);
  if (error) {
    throw new Error(error.message || "Failed to update project sessions");
  }
}

async function replaceProjectMemoryLinks(projectId: string, memoryIds: string[]) {
  const client = getSupabasePersistenceClient();
  await client.from("project_memory_links").delete().eq("project_id", projectId);

  if (memoryIds.length === 0) return;

  const rows = memoryIds.map((memoryId) => ({
    project_id: projectId,
    memory_id: memoryId,
  }));
  const { error } = await client.from("project_memory_links").insert(rows);
  if (error) {
    throw new Error(error.message || "Failed to update project memory");
  }
}

export const supabaseProjectRepository: ProjectRepository = {
  async listProjects(options = {}) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("projects")
      .select(projectSelect)
      .eq("owner_id", requireOwnerId(options.ownerId))
      .order("updated_at", { ascending: false });

    const rows = ensureData(data, error, "Failed to list projects");
    return rows.map(toProjectSummaryFromRow);
  },

  async getProject(projectId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("projects")
      .select(projectSelect)
      .eq("id", projectId)
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    const row = ensureData(data, error, "Project not found");
    return toProjectDocumentFromRow(row);
  },

  async createProject(input = {}) {
    const client = getSupabasePersistenceClient();
    const ownerId = requireOwnerId(input.ownerId);
    const sessionIds = Array.isArray(input.sessionIds)
      ? [...new Set(input.sessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [];
    const memoryIds = Array.isArray(input.memoryIds)
      ? [...new Set(input.memoryIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))]
      : [];

    const { data, error } = await client
      .from("projects")
      .insert({
        owner_id: ownerId,
        title:
          typeof input.title === "string" && input.title.trim().length > 0
            ? input.title.trim()
            : null,
        global_context: typeof input.globalContext === "string" ? input.globalContext : "",
      })
      .select("id")
      .single();

    const created = ensureData(data, error, "Failed to create project");
    await replaceProjectSessionLinks(created.id, sessionIds);
    await replaceProjectMemoryLinks(created.id, memoryIds);
    return this.getProject(created.id, ownerId);
  },

  async patchProject(projectId, patch, ownerId) {
    const client = getSupabasePersistenceClient();
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      update.title =
        typeof patch.title === "string" && patch.title.trim().length > 0
          ? patch.title.trim()
          : null;
    }
    if (patch.globalContext !== undefined) update.global_context = patch.globalContext;
    if (patch.arenaWinnerBranchKey !== undefined) update.arena_winner_branch_key = patch.arenaWinnerBranchKey;
    if (patch.arenaWinnerSessionId !== undefined) update.arena_winner_session_id = patch.arenaWinnerSessionId;

    if (Object.keys(update).length > 0) {
      const { error } = await client
        .from("projects")
        .update(update)
        .eq("id", projectId)
        .eq("owner_id", requireOwnerId(ownerId));
      if (error) {
        throw new Error(error.message || "Failed to update project");
      }
    }

    if (patch.sessionIds !== undefined) {
      const sessionIds = [...new Set(patch.sessionIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
      await replaceProjectSessionLinks(projectId, sessionIds);
    }

    if (patch.memoryIds !== undefined) {
      const memoryIds = [...new Set(patch.memoryIds.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
      await replaceProjectMemoryLinks(projectId, memoryIds);
    }

    return this.getProject(projectId, requireOwnerId(ownerId));
  },

  async deleteProject(projectId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { error } = await client
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", requireOwnerId(ownerId));
    if (error) {
      throw new Error(error.message || "Failed to delete project");
    }
  },

  async deleteProjects(projectIds, ownerId) {
    const client = getSupabasePersistenceClient();
    const { error } = await client
      .from("projects")
      .delete()
      .in("id", [...new Set(projectIds)])
      .eq("owner_id", requireOwnerId(ownerId));
    if (error) {
      throw new Error(error.message || "Failed to delete projects");
    }
  },
};
