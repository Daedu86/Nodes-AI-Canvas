import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLocalApiUserMock = vi.hoisted(() => vi.fn());
const getUserPlanMock = vi.hoisted(() => vi.fn());
const getPersistentChatUsageSnapshotMock = vi.hoisted(() => vi.fn());
const getLlmSettingsMock = vi.hoisted(() => vi.fn());
const isAdminUserMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/server/request-guards", () => ({
  requireLocalApiUser: requireLocalApiUserMock,
}));

vi.mock("../lib/user-plan-store", () => ({
  getUserPlan: getUserPlanMock,
}));

vi.mock("../lib/chat-usage-store", () => ({
  getPersistentChatUsageSnapshot: getPersistentChatUsageSnapshotMock,
}));

vi.mock("../lib/llm-settings-store", () => ({
  getLlmSettings: getLlmSettingsMock,
}));

vi.mock("../lib/server/admin-access", () => ({
  isAdminUser: isAdminUserMock,
}));

import { GET } from "../app/api/account/plan/route";

describe("/api/account/plan", () => {
  beforeEach(() => {
    requireLocalApiUserMock.mockReset();
    getUserPlanMock.mockReset();
    getPersistentChatUsageSnapshotMock.mockReset();
    getLlmSettingsMock.mockReset();
    isAdminUserMock.mockReset();

    requireLocalApiUserMock.mockResolvedValue({
      user: {
        email: "admin@example.com",
        id: "user-1",
        name: "Admin User",
      },
    });
    getUserPlanMock.mockResolvedValue("free");
    getPersistentChatUsageSnapshotMock.mockResolvedValue({
      dayCount: 11,
      dayWindowStart: Date.UTC(2026, 3, 20),
      hourCount: 3,
      hourWindowStart: Date.UTC(2026, 3, 20, 10),
      minuteCount: 1,
      minuteWindowStart: Date.UTC(2026, 3, 20, 10, 30),
    });
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        ollama: {
          apiKeys: [{ id: "ollama-1", key: "ollama-key", name: "Ollama", createdAt: "" }],
        },
        openrouter: {
          apiKeys: [{ id: "or-1", key: "or-key", name: "OpenRouter", createdAt: "" }],
        },
      },
    });
    isAdminUserMock.mockReturnValue(true);
  });

  it("returns plan, limits, usage, provider key counts, and admin flag", async () => {
    const response = await GET(new Request("http://localhost/api/account/plan"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isAdmin: true,
      limits: expect.objectContaining({
        concurrent: 1,
        perDay: 120,
        perHour: 40,
        perMinute: 8,
        plan: "free",
      }),
      plan: {
        current: "free",
      },
      providers: {
        ollama: {
          keyCount: 1,
        },
        openrouter: expect.objectContaining({
          keyCount: 1,
          requireUserKey: true,
        }),
      },
      usage: expect.objectContaining({
        dayCount: 11,
        hourCount: 3,
        minuteCount: 1,
      }),
    });
  });
});
