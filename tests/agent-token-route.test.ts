import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLocalApiUserMock = vi.hoisted(() => vi.fn());
const isAgentTokenConfiguredMock = vi.hoisted(() => vi.fn());
const mintAgentTokenMock = vi.hoisted(() => vi.fn());
const revokeAgentTokenRecordMock = vi.hoisted(() => vi.fn());
const upsertAgentTokenRecordMock = vi.hoisted(() => vi.fn());
const countActiveAgentTokensMock = vi.hoisted(() => vi.fn());
const getUserPlanMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/server/request-guards", () => ({
  requireLocalApiUser: requireLocalApiUserMock,
}));

vi.mock("../lib/server/agent-token", () => ({
  isAgentTokenConfigured: isAgentTokenConfiguredMock,
  mintAgentToken: mintAgentTokenMock,
}));

vi.mock("../lib/server/agent-work", () => ({
  countActiveAgentTokens: countActiveAgentTokensMock,
  revokeAgentTokenRecord: revokeAgentTokenRecordMock,
  upsertAgentTokenRecord: upsertAgentTokenRecordMock,
}));

vi.mock("../lib/user-plan-store", () => ({
  getUserPlan: getUserPlanMock,
}));

import { DELETE, POST } from "../app/api/agents/token/route";

describe("/api/agents/token", () => {
  beforeEach(() => {
    requireLocalApiUserMock.mockReset();
    isAgentTokenConfiguredMock.mockReset();
    mintAgentTokenMock.mockReset();
    revokeAgentTokenRecordMock.mockReset();
    upsertAgentTokenRecordMock.mockReset();
    countActiveAgentTokensMock.mockReset();
    getUserPlanMock.mockReset();

    requireLocalApiUserMock.mockResolvedValue({
      user: {
        email: "user@example.com",
        id: "user-1",
        isAgent: false,
        name: "Test User",
      },
    });
    isAgentTokenConfiguredMock.mockReturnValue(true);
    getUserPlanMock.mockResolvedValue("paid");
    countActiveAgentTokensMock.mockResolvedValue(0);
    mintAgentTokenMock.mockResolvedValue({
      token: "token-value",
      tokenId: "token-1",
      label: "CI bot",
      expiresAt: "2026-04-25T10:30:00.000Z",
    });
    upsertAgentTokenRecordMock.mockResolvedValue(true);
    revokeAgentTokenRecordMock.mockResolvedValue({
      tokenId: "token-1",
    });
  });

  it("mints a token with an explicit expiry and returns save status", async () => {
    const response = await POST(
      new Request("http://localhost/api/agents/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresAt: "2026-04-25T10:30:00.000Z",
          label: "CI bot",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saved: true,
      token: "token-value",
      tokenId: "token-1",
      label: "CI bot",
      expiresAt: "2026-04-25T10:30:00.000Z",
    });
    expect(mintAgentTokenMock).toHaveBeenCalledTimes(1);
    expect(upsertAgentTokenRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-1",
        tokenId: "token-1",
      }),
    );
  });

  it("revokes an existing token", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/agents/token?tokenId=token-1", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      revoked: true,
      tokenId: "token-1",
    });
    expect(revokeAgentTokenRecordMock).toHaveBeenCalledWith({
      ownerId: "user-1",
      tokenId: "token-1",
    });
  });

  it("blocks agent-authenticated callers from minting or deleting tokens", async () => {
    requireLocalApiUserMock.mockResolvedValue({
      user: {
        email: null,
        id: "user-1",
        isAgent: true,
        name: "Agent",
      },
    });

    const postResponse = await POST(
      new Request("http://localhost/api/agents/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(postResponse.status).toBe(403);

    const deleteResponse = await DELETE(
      new Request("http://localhost/api/agents/token?tokenId=token-1", {
        method: "DELETE",
      }),
    );
    expect(deleteResponse.status).toBe(403);
  });

  it("enforces one active agent token on free tier", async () => {
    getUserPlanMock.mockResolvedValue("free");
    countActiveAgentTokensMock.mockResolvedValue(1);

    const response = await POST(
      new Request("http://localhost/api/agents/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: "Second agent",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Free tier allows only one active agent.",
    });
    expect(mintAgentTokenMock).not.toHaveBeenCalled();
  });
});
