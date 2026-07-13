import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  acceptProjectInvitationForUser,
  createProjectInvitationForUser,
  declineProjectInvitationForUser,
  listProjectInvitationsForUser,
  previewProjectInvitationToken,
  ProjectInvitationError,
  removeProjectMemberOrInvitationForUser,
  revokeProjectInvitationForUser,
  updateAcceptedProjectMemberForUser,
} from "../lib/project-invitation-service";
import { createProject, upsertProjectMember } from "../lib/project-store";
import { getProjectForUser } from "../lib/project-collaboration";

const owner = { email: "owner@example.com", id: "owner-1", name: "Owner" };
const invitee = { email: "viewer@example.com", id: "viewer-1", name: "Viewer" };
const other = { email: "other@example.com", id: "other-1", name: "Other" };
const agent = {
  email: null,
  id: "agent-1",
  isAgent: true,
  name: "Agent",
};

const invitationToken = (inviteUrl: string) => inviteUrl.split("/").at(-1) ?? "";

describe("project invitation lifecycle", () => {
  let projectDir = "";
  let invitationDir = "";
  let sessionDir = "";
  let memoryDir = "";
  const originalBackend = process.env.NODES_PERSISTENCE_BACKEND;
  const originalProjectDir = process.env.PROJECT_STORE_DIR;
  const originalInvitationDir = process.env.PROJECT_INVITATION_STORE_DIR;
  const originalSessionDir = process.env.SESSION_STORE_DIR;
  const originalMemoryDir = process.env.PROJECT_MEMORY_STORE_DIR;

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "nodes-invite-projects-"));
    invitationDir = await mkdtemp(path.join(os.tmpdir(), "nodes-invitations-"));
    sessionDir = await mkdtemp(path.join(os.tmpdir(), "nodes-invite-sessions-"));
    memoryDir = await mkdtemp(path.join(os.tmpdir(), "nodes-invite-memory-"));
    process.env.NODES_PERSISTENCE_BACKEND = "file";
    process.env.PROJECT_STORE_DIR = projectDir;
    process.env.PROJECT_INVITATION_STORE_DIR = invitationDir;
    process.env.SESSION_STORE_DIR = sessionDir;
    process.env.PROJECT_MEMORY_STORE_DIR = memoryDir;
  });

  afterEach(async () => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("NODES_PERSISTENCE_BACKEND", originalBackend);
    restore("PROJECT_STORE_DIR", originalProjectDir);
    restore("PROJECT_INVITATION_STORE_DIR", originalInvitationDir);
    restore("SESSION_STORE_DIR", originalSessionDir);
    restore("PROJECT_MEMORY_STORE_DIR", originalMemoryDir);
    await Promise.all(
      [projectDir, invitationDir, sessionDir, memoryDir].map((dir) =>
        dir ? rm(dir, { recursive: true, force: true }) : Promise.resolve(),
      ),
    );
  });

  it("keeps pending invitations non-authorizing and binds access to user id on acceptance", async () => {
    const project = await createProject({ ownerId: owner.id, title: "Shared analysis" });
    const created = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });

    expect(created.inviteUrl).toMatch(
      /^https:\/\/nodes\.example\/invite\/project\/[A-Za-z0-9_-]{43}$/u,
    );
    expect(created.project.members).toEqual([
      expect.objectContaining({ email: invitee.email, status: "pending", userId: null }),
    ]);
    await expect(getProjectForUser(project.id, invitee)).rejects.toThrow("Project not found");

    const token = invitationToken(created.inviteUrl);
    const preview = await previewProjectInvitationToken(token);
    expect(preview).toMatchObject({
      inviteeEmailMasked: expect.stringContaining("@"),
      projectId: project.id,
      role: "viewer",
      status: "pending",
    });
    expect(JSON.stringify(preview)).not.toContain(invitee.email);

    await expect(acceptProjectInvitationForUser(token, other)).rejects.toMatchObject({
      code: "invitation_email_mismatch",
      status: 403,
    });

    await expect(acceptProjectInvitationForUser(token, invitee)).resolves.toEqual({
      projectId: project.id,
      role: "viewer",
    });
    const shared = await getProjectForUser(project.id, invitee);
    expect(shared.accessRole).toBe("viewer");
    expect(shared.members[0]).toMatchObject({
      acceptedAt: expect.any(String),
      status: "accepted",
      userId: invitee.id,
    });
    await expect(acceptProjectInvitationForUser(token, invitee)).rejects.toMatchObject({
      code: "invitation_not_pending",
      status: 409,
    });
  });

  it("revokes the old token when an owner reissues an invitation", async () => {
    const project = await createProject({ ownerId: owner.id });
    const first = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    const second = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "editor",
      user: owner,
    });
    const firstToken = invitationToken(first.inviteUrl);
    const secondToken = invitationToken(second.inviteUrl);

    expect((await previewProjectInvitationToken(firstToken))?.status).toBe("revoked");
    await expect(acceptProjectInvitationForUser(firstToken, invitee)).rejects.toBeInstanceOf(
      ProjectInvitationError,
    );
    await expect(acceptProjectInvitationForUser(secondToken, invitee)).resolves.toEqual({
      projectId: project.id,
      role: "editor",
    });
  });

  it("lets only the owner list and revoke pending invitations", async () => {
    const project = await createProject({ ownerId: owner.id });
    const created = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });

    await expect(listProjectInvitationsForUser(project.id, owner)).resolves.toEqual([
      expect.objectContaining({ id: created.invitation.id, status: "pending" }),
    ]);
    await expect(listProjectInvitationsForUser(project.id, other)).rejects.toThrow();
    await expect(
      revokeProjectInvitationForUser({
        invitationId: created.invitation.id,
        projectId: project.id,
        user: other,
      }),
    ).rejects.toThrow();

    const updated = await revokeProjectInvitationForUser({
      invitationId: created.invitation.id,
      projectId: project.id,
      user: owner,
    });
    expect(updated.members).toEqual([]);
    const token = invitationToken(created.inviteUrl);
    expect((await previewProjectInvitationToken(token))?.status).toBe("revoked");

    await expect(
      revokeProjectInvitationForUser({
        invitationId: created.invitation.id,
        projectId: project.id,
        user: owner,
      }),
    ).rejects.toMatchObject({
      code: "invitation_not_pending",
      status: 409,
    });
  });

  it("validates invitation recipients and token formats", async () => {
    const project = await createProject({ ownerId: owner.id });

    await expect(
      createProjectInvitationForUser({
        appOrigin: "https://nodes.example",
        email: "not-an-email",
        projectId: project.id,
        role: "viewer",
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "invalid_invitation_email", status: 400 });

    await expect(
      createProjectInvitationForUser({
        appOrigin: "https://nodes.example",
        email: " OWNER@EXAMPLE.COM ",
        projectId: project.id,
        role: "viewer",
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "owner_already_has_access", status: 409 });

    await expect(previewProjectInvitationToken("invalid")).resolves.toBeNull();
    await expect(acceptProjectInvitationForUser("invalid", invitee)).rejects.toMatchObject({
      code: "invalid_invitation_token",
      status: 404,
    });
    await expect(declineProjectInvitationForUser("invalid", invitee)).rejects.toMatchObject({
      code: "invalid_invitation_token",
      status: 404,
    });
  });

  it("requires a human identity with an email to accept or decline", async () => {
    const project = await createProject({ ownerId: owner.id });
    const created = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    const token = invitationToken(created.inviteUrl);

    await expect(acceptProjectInvitationForUser(token, agent)).rejects.toMatchObject({
      code: "agent_invitation_not_supported",
      status: 403,
    });
    await expect(
      declineProjectInvitationForUser(token, {
        email: null,
        id: "human-without-email",
        name: "Human",
      }),
    ).rejects.toMatchObject({
      code: "verified_email_required",
      status: 403,
    });
  });

  it("allows an invitee to decline and prevents later acceptance", async () => {
    const project = await createProject({ ownerId: owner.id });
    const created = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    const token = invitationToken(created.inviteUrl);

    await expect(declineProjectInvitationForUser(token, invitee)).resolves.toBe(true);
    expect((await previewProjectInvitationToken(token))?.status).toBe("declined");
    expect((await getProjectForUser(project.id, owner)).members).toEqual([]);
    await expect(acceptProjectInvitationForUser(token, invitee)).rejects.toMatchObject({
      code: "invitation_not_pending",
      status: 409,
    });
    await expect(declineProjectInvitationForUser(token, invitee)).rejects.toMatchObject({
      code: "invitation_not_pending",
      status: 409,
    });
  });

  it("updates and removes accepted members while revoking pending members", async () => {
    const project = await createProject({ ownerId: owner.id });
    const acceptedInvitation = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    await acceptProjectInvitationForUser(
      invitationToken(acceptedInvitation.inviteUrl),
      invitee,
    );

    const roleUpdated = await updateAcceptedProjectMemberForUser({
      email: " VIEWER@EXAMPLE.COM ",
      projectId: project.id,
      role: "editor",
      user: owner,
    });
    expect(roleUpdated.members).toEqual([
      expect.objectContaining({ email: invitee.email, role: "editor", status: "accepted" }),
    ]);

    const acceptedRemoved = await removeProjectMemberOrInvitationForUser({
      email: invitee.email,
      projectId: project.id,
      user: owner,
    });
    expect(acceptedRemoved.members).toEqual([]);

    const pendingInvitation = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: other.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    const pendingRemoved = await removeProjectMemberOrInvitationForUser({
      email: other.email,
      projectId: project.id,
      user: owner,
    });
    expect(pendingRemoved.members).toEqual([]);
    expect(
      (await previewProjectInvitationToken(invitationToken(pendingInvitation.inviteUrl)))?.status,
    ).toBe("revoked");

    const unchanged = await removeProjectMemberOrInvitationForUser({
      email: "missing@example.com",
      projectId: project.id,
      user: owner,
    });
    expect(unchanged.members).toEqual([]);
  });

  it("rejects role changes for invalid, pending, or already accepted recipients", async () => {
    const project = await createProject({ ownerId: owner.id });

    await expect(
      updateAcceptedProjectMemberForUser({
        email: "invalid",
        projectId: project.id,
        role: "editor",
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "invalid_member_email", status: 400 });

    await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });
    await expect(
      updateAcceptedProjectMemberForUser({
        email: invitee.email,
        projectId: project.id,
        role: "editor",
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "member_not_accepted", status: 409 });

    await upsertProjectMember(
      project.id,
      { email: other.email, role: "viewer" },
      owner.id,
    );
    await expect(
      createProjectInvitationForUser({
        appOrigin: "https://nodes.example",
        email: other.email,
        projectId: project.id,
        role: "editor",
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "already_project_member", status: 409 });

    await expect(
      removeProjectMemberOrInvitationForUser({
        email: "invalid",
        projectId: project.id,
        user: owner,
      }),
    ).rejects.toMatchObject({ code: "invalid_member_email", status: 400 });
  });
});
