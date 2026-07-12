import type { ProjectCollaboratorRole } from "@/lib/project-documents";

export const PROJECT_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "declined",
  "expired",
] as const;

export type ProjectInvitationStatus =
  (typeof PROJECT_INVITATION_STATUSES)[number];

export type ProjectInvitation = {
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  createdAt: string;
  declinedAt: string | null;
  expiresAt: string;
  id: string;
  inviteeEmail: string;
  inviterId: string;
  projectId: string;
  revokedAt: string | null;
  role: ProjectCollaboratorRole;
  status: ProjectInvitationStatus;
  updatedAt: string;
};

export type ProjectInvitationPreview = {
  expiresAt: string;
  inviteeEmailMasked: string;
  projectId: string;
  projectTitle: string | null;
  role: ProjectCollaboratorRole;
  status: ProjectInvitationStatus;
};

export type ProjectInvitationCreateResult = {
  invitation: ProjectInvitation;
  inviteUrl: string;
};

export const isPendingProjectInvitation = (
  invitation: Pick<ProjectInvitation, "expiresAt" | "status">,
  now = Date.now(),
) =>
  invitation.status === "pending" &&
  new Date(invitation.expiresAt).getTime() > now;
