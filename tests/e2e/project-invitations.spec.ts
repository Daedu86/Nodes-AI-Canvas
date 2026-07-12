import { expect, test } from "@playwright/test";

const ownerHeaders = {
  "x-test-user-email": "owner-invite@nodes.local",
  "x-test-user-id": "owner-invite-user",
  "x-test-user-name": "Invitation Owner",
};
const inviteeHeaders = {
  "x-test-user-email": "invitee@nodes.local",
  "x-test-user-id": "invitee-user",
  "x-test-user-name": "Invitation Recipient",
};
const wrongHeaders = {
  "x-test-user-email": "wrong@nodes.local",
  "x-test-user-id": "wrong-user",
  "x-test-user-name": "Wrong Recipient",
};

test("project invitations require acceptance and bind access to the recipient identity", async ({ request }) => {
  const createProject = await request.post("/api/projects", {
    data: { title: "Invitation E2E" },
    headers: ownerHeaders,
  });
  expect(createProject.status()).toBe(201);
  const project = (await createProject.json()) as { project: { id: string } };
  const projectId = project.project.id;

  try {
    const createInvitation = await request.post(`/api/projects/${projectId}/invitations`, {
      data: { email: inviteeHeaders["x-test-user-email"], role: "editor" },
      headers: ownerHeaders,
    });
    expect(createInvitation.status()).toBe(201);
    const invitationBody = (await createInvitation.json()) as {
      invitation: { id: string; status: string };
      inviteUrl: string;
      project: { members: Array<{ email: string; status: string }> };
    };
    expect(invitationBody.invitation.status).toBe("pending");
    expect(invitationBody.project.members).toContainEqual(
      expect.objectContaining({ email: inviteeHeaders["x-test-user-email"], status: "pending" }),
    );
    const token = invitationBody.inviteUrl.split("/").at(-1) ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const pendingAccess = await request.get(`/api/projects/${projectId}`, {
      headers: inviteeHeaders,
    });
    expect(pendingAccess.status()).toBe(404);

    const preview = await request.get(`/api/project-invitations/preview?token=${token}`);
    expect(preview.status()).toBe(200);
    const previewBody = (await preview.json()) as {
      invitation: { inviteeEmailMasked: string; projectId: string; status: string };
    };
    expect(previewBody.invitation.projectId).toBe(projectId);
    expect(previewBody.invitation.status).toBe("pending");
    expect(previewBody.invitation.inviteeEmailMasked).not.toContain(
      inviteeHeaders["x-test-user-email"],
    );

    const wrongAccept = await request.post("/api/project-invitations/accept", {
      data: { token },
      headers: wrongHeaders,
    });
    expect(wrongAccept.status()).toBe(403);

    const accepted = await request.post("/api/project-invitations/accept", {
      data: { token },
      headers: inviteeHeaders,
    });
    expect(accepted.status()).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      accepted: { projectId, role: "editor" },
    });

    const acceptedAccess = await request.get(`/api/projects/${projectId}`, {
      headers: inviteeHeaders,
    });
    expect(acceptedAccess.status()).toBe(200);
    await expect(acceptedAccess.json()).resolves.toMatchObject({
      project: {
        accessRole: "editor",
        members: [
          expect.objectContaining({
            email: inviteeHeaders["x-test-user-email"],
            status: "accepted",
            userId: inviteeHeaders["x-test-user-id"],
          }),
        ],
      },
    });

    const reused = await request.post("/api/project-invitations/accept", {
      data: { token },
      headers: inviteeHeaders,
    });
    expect(reused.status()).toBe(409);
  } finally {
    const cleanup = await request.delete("/api/projects", {
      data: { projectIds: [projectId] },
      headers: ownerHeaders,
    });
    expect([200, 404]).toContain(cleanup.status());
  }
});
