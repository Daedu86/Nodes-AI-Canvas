import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectInvitation } from "@/lib/project-invitations";
import type { ProjectInvitationRepository } from "@/lib/persistence/project-invitation-repository";
import { fileProjectRepositoryV2 } from "@/lib/persistence/file/file-project-repository-v2";
import { maskInvitationEmail } from "@/lib/server/project-invitation-token";

const getInvitationStoreDir = () =>
  process.env.PROJECT_INVITATION_STORE_DIR
    ? path.resolve(process.env.PROJECT_INVITATION_STORE_DIR)
    : path.join(process.cwd(), "data", "project-invitations");
const getInvitationStorePath = () => path.join(getInvitationStoreDir(), "invitations.json");
let writeQueue = Promise.resolve();

const withWriteLock = async <T>(operation: () => Promise<T>) => {
  const previous = writeQueue;
  let release = () => {};
  writeQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
};

const readInvitations = async (): Promise<ProjectInvitation[]> => {
  try {
    const parsed = JSON.parse(await fs.readFile(getInvitationStorePath(), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as ProjectInvitation[]) : [];
  } catch { return []; }
};

const writeInvitations = async (invitations: ProjectInvitation[]) => {
  await fs.mkdir(getInvitationStoreDir(), { recursive: true });
  const destination = getInvitationStorePath();
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(invitations, null, 2), "utf8");
  await fs.rename(temporary, destination);
};

const tokenHashPath = (invitationId: string) =>
  path.join(getInvitationStoreDir(), `${invitationId}.token-hash`);
const resolveStatus = (invitation: ProjectInvitation): ProjectInvitation =>
  invitation.status === "pending" && Date.parse(invitation.expiresAt) <= Date.now()
    ? { ...invitation, status: "expired" }
    : invitation;

const findInvitationByHash = async (tokenHash: string) => {
  const invitations = await readInvitations();
  for (let index = 0; index < invitations.length; index += 1) {
    try {
      if ((await fs.readFile(tokenHashPath(invitations[index].id), "utf8")).trim() === tokenHash) {
        return { index, invitation: invitations[index], invitations };
      }
    } catch {
      // Missing local hash files are treated as invalid invitations.
    }
  }
  return null;
};

export const fileProjectInvitationRepository: ProjectInvitationRepository = {
  async createInvitation(input) {
    await fileProjectRepositoryV2.getProject(input.projectId, input.ownerId);
    return withWriteLock(async () => {
      const now = new Date().toISOString();
      const current = await readInvitations();
      const project = await fileProjectRepositoryV2.getProject(input.projectId, input.ownerId);
      if (project.members.some((member) => member.email === input.inviteeEmail && member.status === "accepted")) {
        throw new Error("user is already a project member");
      }
      const revoked = current.map((invitation) =>
        invitation.projectId === input.projectId &&
        invitation.inviteeEmail === input.inviteeEmail &&
        invitation.status === "pending"
          ? { ...invitation, revokedAt: now, status: "revoked" as const, updatedAt: now }
          : invitation,
      );
      const invitation: ProjectInvitation = {
        acceptedAt: null,
        acceptedByUserId: null,
        createdAt: now,
        declinedAt: null,
        expiresAt: input.expiresAt,
        id: randomUUID(),
        inviteeEmail: input.inviteeEmail,
        inviterId: input.inviterId,
        projectId: input.projectId,
        revokedAt: null,
        role: input.role,
        status: "pending",
        updatedAt: now,
      };
      await writeInvitations([invitation, ...revoked]);
      await fileProjectRepositoryV2.upsertProjectMember(input.projectId, {
        acceptedAt: null,
        email: input.inviteeEmail,
        invitationId: invitation.id,
        role: input.role,
        userId: null,
      }, input.ownerId);
      await fs.writeFile(tokenHashPath(invitation.id), input.tokenHash, { encoding: "utf8", mode: 0o600 });
      return invitation;
    });
  },

  async listInvitations(projectId, ownerId) {
    await fileProjectRepositoryV2.getProject(projectId, ownerId);
    return (await readInvitations())
      .filter((invitation) => invitation.projectId === projectId)
      .map(resolveStatus)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getInvitationPreview(tokenHash) {
    const found = await findInvitationByHash(tokenHash);
    if (!found) return null;
    const invitation = resolveStatus(found.invitation);
    const project = await fileProjectRepositoryV2.getProjectRecordForActor(invitation.projectId, {
      userEmail: null,
      userId: invitation.inviterId,
    });
    return {
      expiresAt: invitation.expiresAt,
      inviteeEmailMasked: maskInvitationEmail(invitation.inviteeEmail),
      projectId: invitation.projectId,
      projectTitle: project.title,
      role: invitation.role,
      status: invitation.status,
    };
  },

  async acceptInvitation(input) {
    return withWriteLock(async () => {
      const found = await findInvitationByHash(input.tokenHash);
      if (!found) throw new Error("invitation not found");
      const resolved = resolveStatus(found.invitation);
      if (resolved.status === "expired") throw new Error("invitation has expired");
      if (resolved.status !== "pending") throw new Error("invitation is no longer pending");
      if (resolved.inviteeEmail !== input.userEmail) {
        throw new Error("invitation email does not match authenticated user");
      }
      const now = new Date().toISOString();
      await fileProjectRepositoryV2.upsertProjectMember(resolved.projectId, {
        acceptedAt: now,
        email: resolved.inviteeEmail,
        invitationId: resolved.id,
        role: resolved.role,
        userId: input.userId,
      }, resolved.inviterId);
      found.invitations[found.index] = {
        ...resolved,
        acceptedAt: now,
        acceptedByUserId: input.userId,
        status: "accepted",
        updatedAt: now,
      };
      await writeInvitations(found.invitations);
      return { projectId: resolved.projectId, role: resolved.role };
    });
  },

  async revokeInvitation(input) {
    return withWriteLock(async () => {
      await fileProjectRepositoryV2.getProject(input.projectId, input.ownerId);
      const invitations = await readInvitations();
      const index = invitations.findIndex((invitation) =>
        invitation.id === input.invitationId &&
        invitation.projectId === input.projectId &&
        invitation.status === "pending",
      );
      if (index < 0) return false;
      const invitation = invitations[index];
      const now = new Date().toISOString();
      invitations[index] = { ...invitation, revokedAt: now, status: "revoked", updatedAt: now };
      await writeInvitations(invitations);
      await fileProjectRepositoryV2.removeProjectMember(input.projectId, invitation.inviteeEmail, input.ownerId);
      return true;
    });
  },

  async declineInvitation(input) {
    return withWriteLock(async () => {
      const found = await findInvitationByHash(input.tokenHash);
      if (!found || found.invitation.status !== "pending") return false;
      if (found.invitation.inviteeEmail !== input.userEmail) {
        throw new Error("invitation email does not match authenticated user");
      }
      const now = new Date().toISOString();
      found.invitations[found.index] = {
        ...found.invitation,
        declinedAt: now,
        status: "declined",
        updatedAt: now,
      };
      await writeInvitations(found.invitations);
      await fileProjectRepositoryV2.removeProjectMember(
        found.invitation.projectId,
        found.invitation.inviteeEmail,
        found.invitation.inviterId,
      );
      return true;
    });
  },
};
