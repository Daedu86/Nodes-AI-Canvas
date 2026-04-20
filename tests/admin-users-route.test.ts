import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUserMock = vi.hoisted(() => vi.fn());
const listAdminUsersMock = vi.hoisted(() => vi.fn());
const updateAdminUserPlanMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/server/admin-access", () => ({
  requireAdminApiUser: requireAdminApiUserMock,
}));

vi.mock("../lib/server/admin-users", () => ({
  listAdminUsers: listAdminUsersMock,
  updateAdminUserPlan: updateAdminUserPlanMock,
}));

import { GET, PATCH } from "../app/api/admin/users/route";

describe("/api/admin/users", () => {
  beforeEach(() => {
    requireAdminApiUserMock.mockReset();
    listAdminUsersMock.mockReset();
    updateAdminUserPlanMock.mockReset();

    requireAdminApiUserMock.mockResolvedValue({
      user: {
        email: "admin@example.com",
        id: "admin-1",
        name: "Admin",
      },
    });
    listAdminUsersMock.mockResolvedValue([
      {
        counts: { agentTokens: 0, projects: 2, sessions: 4 },
        createdAt: "2026-04-20T10:00:00.000Z",
        lastActivityAt: "2026-04-20T12:00:00.000Z",
        limits: { concurrent: 1, perDay: 120, perHour: 40, perMinute: 8, plan: "free" },
        ownerId: "user-1",
        plan: "free",
        providers: { ollamaKeyCount: 0, openrouterKeyCount: 1 },
        usage: {
          dayCount: 2,
          dayWindowStart: Date.UTC(2026, 3, 20),
          hourCount: 1,
          hourWindowStart: Date.UTC(2026, 3, 20, 12),
          minuteCount: 0,
          minuteWindowStart: Date.UTC(2026, 3, 20, 12, 30),
        },
      },
    ]);
  });

  it("lists admin-visible users", async () => {
    const response = await GET(new Request("http://localhost/api/admin/users"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      users: expect.any(Array),
      viewer: {
        email: "admin@example.com",
        id: "admin-1",
      },
    });
  });

  it("validates ownerId on patch", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        body: JSON.stringify({ plan: "paid" }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "ownerId is required." });
  });

  it("updates a user plan", async () => {
    updateAdminUserPlanMock.mockResolvedValue({
      counts: { agentTokens: 0, projects: 2, sessions: 4 },
      createdAt: "2026-04-20T10:00:00.000Z",
      lastActivityAt: "2026-04-20T12:00:00.000Z",
      limits: { concurrent: 2, perDay: 600, perHour: 120, perMinute: 24, plan: "paid" },
      ownerId: "user-1",
      plan: "paid",
      providers: { ollamaKeyCount: 0, openrouterKeyCount: 1 },
      usage: {
        dayCount: 2,
        dayWindowStart: Date.UTC(2026, 3, 20),
        hourCount: 1,
        hourWindowStart: Date.UTC(2026, 3, 20, 12),
        minuteCount: 0,
        minuteWindowStart: Date.UTC(2026, 3, 20, 12, 30),
      },
    });

    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        body: JSON.stringify({ ownerId: "user-1", plan: "paid" }),
        method: "PATCH",
      }),
    );

    expect(updateAdminUserPlanMock).toHaveBeenCalledWith("user-1", "paid");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({
        ownerId: "user-1",
        plan: "paid",
      }),
    });
  });
});
