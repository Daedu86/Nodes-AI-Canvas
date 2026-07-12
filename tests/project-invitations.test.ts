import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  acceptProjectInvitationForUser,
  createProjectInvitationForUser,
  previewProjectInvitationToken,
  ProjectInvitationError,
  revokeProjectInvitationForUser,
} from "../lib/project-invitation-service";
import { createProject } from "../lib/project-store";
import { getProjectForUser } from "../lib/project-collaboration";

const owner = { email: "owner@example.com", id: "owner-1", name: "Owner" };
const invitee = { email: "viewer@example.com", id: "viewer-1", name: "Viewer" };
const other = { email: "other@example.com", id: "other-1", name: "Other" };

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
    await Promise.all([projectDir, invitationDir, sessionDir, memoryDir].map((dir) =>
      dir ? rm(dir, { recursive: true, force: true }) : Promise.resolve(),
    ));
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

    expect(created.inviteUrl).toMatch(/^https:\/\/nodes\.example\/invite\/project\/[A-Za-z0-9_-]{43}$/u);
    expect(created.project.members).toEqual([
      expect.objectContaining({ email: invitee.email, status: "pending", userId: null }),
    ]);
    await expect(getProjectForUser(project.id, invitee)).rejects.toThrow("Project not found");

    const token = created.inviteUrl.split("/").at(-1) ?? "";
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
    const firstToken = first.inviteUrl.split("/").at(-1) ?? "";
    const secondToken = second.inviteUrl.split("/").at(-1) ?? "";

    expect((await previewProjectInvitationToken(firstToken))?.status).toBe("revoked");
    await expect(acceptProjectInvitationForUser(firstToken, invitee)).rejects.toBeInstanceOf(ProjectInvitationError);
    await expect(acceptProjectInvitationForUser(secondToken, invitee)).resolves.toEqual({
      projectId: project.id,
      role: "editor",
    });
  });

  it("lets only the owner revoke a pending invitation", async () => {
    const project = await createProject({ ownerId: owner.id });
    const created = await createProjectInvitationForUser({
      appOrigin: "https://nodes.example",
      email: invitee.email,
      projectId: project.id,
      role: "viewer",
      user: owner,
    });

    await expect(revokeProjectInvitationForUser({
      invitationId: created.invitation.id,
      projectId: project.id,
      user: other,
    })).rejects.toThrow();

    const updated = await revokeProjectInvitationForUser({
      invitationId: created.invitation.id,
      projectId: project.id,
      user: owner,
    });
    expect(updated.members).toEqual([]);
    const token = created.inviteUrl.split("/").at(-1) ?? "";
    expect((await previewProjectInvitationToken(token))?.status).toBe("revoked");
  });
});
