import type { ProjectCollaboratorRole } from "@/lib/project-documents";
import type { AuthenticatedUser } from "@/lib/server/auth-user";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  declineProjectInvitation,
  getProjectInvitationPreview,
  listProjectInvitations,
  revokeProjectInvitation,
} from "@/lib/project-invitation-store";
import {
  createProjectInvitationToken,
  hashProjectInvitationToken,
  isValidProjectInvitationToken,
  normalizeInvitationEmail,
  resolveProjectInvitationExpiry,
} from "@/lib/server/project-invitation-token";
import {
  getProjectForUser,
  ProjectAccessError,
  toProjectActor,
} from "@/lib/project-collaboration";
import {
  getProjectRecordForActor,
  removeProjectMember,
  upsertProjectMember,
} from "@/lib/project-store";

export class ProjectInvitationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProjectInvitationError";
    this.code = code;
    this.status = status;
  }
}

const requireHumanEmail = (user: AuthenticatedUser) => {
  if (user.isAgent) {
    throw new ProjectInvitationError(
      "agent_invitation_not_supported",
      "Agent identities cannot accept project invitations.",
      403,
    );
  }
  const email = normalizeInvitationEmail(user.email);
  if (!email) {
    throw new ProjectInvitationError(
      "verified_email_required",
      "A signed-in account with an email address is required.",
      403,
    );
  }
  return email;
};

const assertOwner = async (projectId: string, user: AuthenticatedUser) => {
  const project = await getProjectForUser(projectId, user);
  if (project.accessRole !== "owner") {
    throw new ProjectAccessError(
      "Only the project owner can manage invitations.",
      403,
    );
  }
  return project;
};

export async function createProjectInvitationForUser(input: {
  appOrigin: string;
  email: unknown;
  expiresAt?: unknown;
  projectId: string;
  role: ProjectCollaboratorRole;
  user: AuthenticatedUser;
}) {
  const project = await assertOwner(input.projectId, input.user);
  const inviteeEmail = normalizeInvitationEmail(input.email);
  if (!inviteeEmail) {
    throw new ProjectInvitationError(
      "invalid_invitation_email",
      "Enter a valid invitation email address.",
    );
  }
  const ownerEmail = normalizeInvitationEmail(input.user.email);
  if (ownerEmail && inviteeEmail === ownerEmail) {
    throw new ProjectInvitationError(
      "owner_already_has_access",
      "The project owner already has access.",
      409,
    );
  }
  const existingMember = project.members.find(
    (member) => member.email === inviteeEmail && member.status === "accepted",
  );
  if (existingMember) {
    throw new ProjectInvitationError(
      "already_project_member",
      "This user is already a project member.",
      409,
    );
  }

  const token = createProjectInvitationToken();
  const tokenHash = hashProjectInvitationToken(token);
  const invitation = await createProjectInvitation({
    expiresAt: resolveProjectInvitationExpiry(input.expiresAt),
    inviteeEmail,
    inviterId: input.user.id,
    ownerId: input.user.id,
    projectId: input.projectId,
    role: input.role,
    tokenHash,
  });
  const inviteUrl = new URL(
    `/invite/project/${encodeURIComponent(token)}`,
    input.appOrigin,
  ).toString();
  return {
    invitation,
    inviteUrl,
    project: await getProjectForUser(input.projectId, input.user),
  };
}

export async function listProjectInvitationsForUser(
  projectId: string,
  user: AuthenticatedUser,
) {
  await assertOwner(projectId, user);
  return listProjectInvitations(projectId, user.id);
}

export async function revokeProjectInvitationForUser(input: {
  invitationId: string;
  projectId: string;
  user: AuthenticatedUser;
}) {
  await assertOwner(input.projectId, input.user);
  const revoked = await revokeProjectInvitation({
    invitationId: input.invitationId,
    ownerId: input.user.id,
    projectId: input.projectId,
  });
  if (!revoked) {
    throw new ProjectInvitationError(
      "invitation_not_pending",
      "The invitation is no longer pending.",
      409,
    );
  }
  return getProjectForUser(input.projectId, input.user);
}

export async function previewProjectInvitationToken(token: unknown) {
  if (!isValidProjectInvitationToken(token)) return null;
  return getProjectInvitationPreview(hashProjectInvitationToken(token));
}

export async function acceptProjectInvitationForUser(
  token: unknown,
  user: AuthenticatedUser,
) {
  if (!isValidProjectInvitationToken(token)) {
    throw new ProjectInvitationError(
      "invalid_invitation_token",
      "The invitation link is invalid.",
      404,
    );
  }
  const userEmail = requireHumanEmail(user);
  try {
    return await acceptProjectInvitation({
      tokenHash: hashProjectInvitationToken(token),
      userEmail,
      userId: user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("email does not match")) {
      throw new ProjectInvitationError(
        "invitation_email_mismatch",
        "Sign in with the email address that received this invitation.",
        403,
      );
    }
    if (message.includes("expired")) {
      throw new ProjectInvitationError(
        "invitation_expired",
        "This project invitation has expired.",
        410,
      );
    }
    if (message.includes("no longer pending")) {
      throw new ProjectInvitationError(
        "invitation_not_pending",
        "This project invitation has already been used or revoked.",
        409,
      );
    }
    if (message.includes("not found")) {
      throw new ProjectInvitationError(
        "invitation_not_found",
        "The invitation link is invalid.",
        404,
      );
    }
    throw error;
  }
}

export async function declineProjectInvitationForUser(
  token: unknown,
  user: AuthenticatedUser,
) {
  if (!isValidProjectInvitationToken(token)) {
    throw new ProjectInvitationError(
      "invalid_invitation_token",
      "The invitation link is invalid.",
      404,
    );
  }
  const userEmail = requireHumanEmail(user);
  const declined = await declineProjectInvitation({
    tokenHash: hashProjectInvitationToken(token),
    userEmail,
    userId: user.id,
  });
  if (!declined) {
    throw new ProjectInvitationError(
      "invitation_not_pending",
      "This project invitation is no longer pending.",
      409,
    );
  }
  return true;
}

export async function updateAcceptedProjectMemberForUser(input: {
  email: unknown;
  projectId: string;
  role: ProjectCollaboratorRole;
  user: AuthenticatedUser;
}) {
  const project = await assertOwner(input.projectId, input.user);
  const email = normalizeInvitationEmail(input.email);
  if (!email) {
    throw new ProjectInvitationError(
      "invalid_member_email",
      "Enter a valid project member email address.",
    );
  }
  const member = project.members.find((entry) => entry.email === email);
  if (!member || member.status !== "accepted") {
    throw new ProjectInvitationError(
      "member_not_accepted",
      "Only accepted project members can have their role updated.",
      409,
    );
  }
  await upsertProjectMember(
    input.projectId,
    {
      acceptedAt: member.acceptedAt,
      email,
      invitationId: member.invitationId,
      role: input.role,
      userId: member.userId,
    },
    input.user.id,
  );
  return getProjectForUser(input.projectId, input.user);
}

export async function removeProjectMemberOrInvitationForUser(input: {
  email: unknown;
  projectId: string;
  user: AuthenticatedUser;
}) {
  const project = await assertOwner(input.projectId, input.user);
  const email = normalizeInvitationEmail(input.email);
  if (!email) {
    throw new ProjectInvitationError(
      "invalid_member_email",
      "Enter a valid project member email address.",
    );
  }
  const member = project.members.find((entry) => entry.email === email);
  if (!member) return project;
  if (member.status === "pending" && member.invitationId) {
    return revokeProjectInvitationForUser({
      invitationId: member.invitationId,
      projectId: input.projectId,
      user: input.user,
    });
  }
  await removeProjectMember(input.projectId, email, input.user.id);
  return getProjectForUser(input.projectId, input.user);
}

export async function getInvitationProjectForUser(
  projectId: string,
  user: AuthenticatedUser,
) {
  return getProjectRecordForActor(projectId, toProjectActor(user));
}
