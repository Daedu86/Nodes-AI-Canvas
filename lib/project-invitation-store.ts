import { getProjectInvitationRepository } from "@/lib/persistence/repositories";
import type {
  ProjectInvitationAcceptInput,
  ProjectInvitationCreateInput,
  ProjectInvitationDeclineInput,
} from "@/lib/persistence/project-invitation-repository";

export type {
  ProjectInvitationAcceptInput,
  ProjectInvitationCreateInput,
  ProjectInvitationDeclineInput,
};

export const createProjectInvitation = (input: ProjectInvitationCreateInput) =>
  getProjectInvitationRepository().createInvitation(input);

export const listProjectInvitations = (projectId: string, ownerId: string) =>
  getProjectInvitationRepository().listInvitations(projectId, ownerId);

export const getProjectInvitationPreview = (tokenHash: string) =>
  getProjectInvitationRepository().getInvitationPreview(tokenHash);

export const acceptProjectInvitation = (input: ProjectInvitationAcceptInput) =>
  getProjectInvitationRepository().acceptInvitation(input);

export const revokeProjectInvitation = (input: {
  invitationId: string;
  ownerId: string;
  projectId: string;
}) => getProjectInvitationRepository().revokeInvitation(input);

export const declineProjectInvitation = (input: ProjectInvitationDeclineInput) =>
  getProjectInvitationRepository().declineInvitation(input);
