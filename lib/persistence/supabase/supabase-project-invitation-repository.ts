import type {
  ProjectInvitation,
  ProjectInvitationPreview,
  ProjectInvitationStatus,
} from "@/lib/project-invitations";
import type { ProjectCollaboratorRole } from "@/lib/project-documents";
import type { ProjectInvitationRepository } from "@/lib/persistence/project-invitation-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { maskInvitationEmail } from "@/lib/server/project-invitation-token";

const invitationSelect =
  "id,project_id,inviter_id,invitee_email,role,status,expires_at,accepted_at,accepted_by_user_id,revoked_at,declined_at,created_at,updated_at";

type InvitationRow = {
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  created_at: string;
  declined_at: string | null;
  expires_at: string;
  id: string;
  invitee_email: string;
  inviter_id: string;
  project_id: string;
  revoked_at: string | null;
  role: string;
  status: string;
  updated_at: string;
};

const toInvitation = (row: InvitationRow): ProjectInvitation => {
  const role = row.role === "editor" ? "editor" : "viewer";
  const storedStatus = ["pending", "accepted", "revoked", "declined"].includes(row.status)
    ? (row.status as Exclude<ProjectInvitationStatus, "expired">)
    : "revoked";
  const status: ProjectInvitationStatus =
    storedStatus === "pending" && Date.parse(row.expires_at) <= Date.now()
      ? "expired"
      : storedStatus;
  return {
    acceptedAt: row.accepted_at,
    acceptedByUserId: row.accepted_by_user_id,
    createdAt: row.created_at,
    declinedAt: row.declined_at,
    expiresAt: row.expires_at,
    id: row.id,
    inviteeEmail: row.invitee_email,
    inviterId: row.inviter_id,
    projectId: row.project_id,
    revokedAt: row.revoked_at,
    role,
    status,
    updatedAt: row.updated_at,
  };
};

const firstRpcRow = (data: unknown) =>
  Array.isArray(data) && data.length > 0
    ? (data[0] as Record<string, unknown>)
    : null;

export const supabaseProjectInvitationRepository: ProjectInvitationRepository = {
  async createInvitation(input) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("create_project_invitation", {
      p_expires_at: input.expiresAt,
      p_invitee_email: input.inviteeEmail,
      p_inviter_id: input.inviterId,
      p_now: new Date().toISOString(),
      p_owner_id: input.ownerId,
      p_project_id: input.projectId,
      p_role: input.role,
      p_token_hash: input.tokenHash,
    });
    if (error) throw new Error(error.message || "Failed to create project invitation");
    const row = firstRpcRow(data);
    if (!row) throw new Error("Project invitation creation returned no result");
    return toInvitation(row as unknown as InvitationRow);
  },

  async listInvitations(projectId, ownerId) {
    const client = getSupabasePersistenceClient();
    const { data: project, error: projectError } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (projectError || !project) throw new Error("Project not found");
    const { data, error } = await client
      .from("project_invitations")
      .select(invitationSelect)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message || "Failed to list project invitations");
    return (data ?? []).map((row) => toInvitation(row as InvitationRow));
  },

  async getInvitationPreview(tokenHash) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("project_invitations")
      .select(`${invitationSelect},projects(title)`)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !data) return null;
    const invitation = toInvitation(data as unknown as InvitationRow);
    const relation = data.projects as { title?: string | null } | { title?: string | null }[] | null;
    const projectTitle = Array.isArray(relation) ? relation[0]?.title ?? null : relation?.title ?? null;
    return {
      expiresAt: invitation.expiresAt,
      inviteeEmailMasked: maskInvitationEmail(invitation.inviteeEmail),
      projectId: invitation.projectId,
      projectTitle,
      role: invitation.role,
      status: invitation.status,
    } satisfies ProjectInvitationPreview;
  },

  async acceptInvitation(input) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("accept_project_invitation", {
      p_now: new Date().toISOString(),
      p_token_hash: input.tokenHash,
      p_user_email: input.userEmail,
      p_user_id: input.userId,
    });
    if (error) throw new Error(error.message || "Failed to accept project invitation");
    const row = firstRpcRow(data);
    if (!row || typeof row.project_id !== "string") {
      throw new Error("Project invitation acceptance returned no result");
    }
    const role: ProjectCollaboratorRole = row.role === "editor" ? "editor" : "viewer";
    return { projectId: row.project_id, role };
  },

  async revokeInvitation(input) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("revoke_project_invitation", {
      p_invitation_id: input.invitationId,
      p_now: new Date().toISOString(),
      p_owner_id: input.ownerId,
      p_project_id: input.projectId,
    });
    if (error) throw new Error(error.message || "Failed to revoke project invitation");
    return data === true;
  },

  async declineInvitation(input) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("decline_project_invitation", {
      p_now: new Date().toISOString(),
      p_token_hash: input.tokenHash,
      p_user_email: input.userEmail,
      p_user_id: input.userId,
    });
    if (error) throw new Error(error.message || "Failed to decline project invitation");
    return data === true;
  },
};
