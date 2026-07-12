import type {
  ProjectInvitation,
  ProjectInvitationPreview,
} from "@/lib/project-invitations";
import type { ProjectCollaboratorRole } from "@/lib/project-documents";

export type ProjectInvitationCreateInput = {
  expiresAt: string;
  inviteeEmail: string;
  inviterId: string;
  ownerId: string;
  projectId: string;
  role: ProjectCollaboratorRole;
  tokenHash: string;
};

export type ProjectInvitationAcceptInput = {
  tokenHash: string;
  userEmail: string;
  userId: string;
};

export type ProjectInvitationDeclineInput = ProjectInvitationAcceptInput;

export interface ProjectInvitationRepository {
  acceptInvitation(input: ProjectInvitationAcceptInput): Promise<{
    projectId: string;
    role: ProjectCollaboratorRole;
  }>;
  createInvitation(input: ProjectInvitationCreateInput): Promise<ProjectInvitation>;
  declineInvitation(input: ProjectInvitationDeclineInput): Promise<boolean>;
  getInvitationPreview(tokenHash: string): Promise<ProjectInvitationPreview | null>;
  listInvitations(projectId: string, ownerId: string): Promise<ProjectInvitation[]>;
  revokeInvitation(input: {
    invitationId: string;
    ownerId: string;
    projectId: string;
  }): Promise<boolean>;
}
