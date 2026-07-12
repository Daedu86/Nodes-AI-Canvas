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

const requireResponse = (response: Response | undefined) => {
  expect(response).toBeInstanceOf(Response);
  if (!response) throw new Error("Expected the route to return a Response.");
  return response;
};

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
    mintAgentTokenMock.mockImplementation(({ maxAgeSeconds }) => ({
      token: "token-value",
      tokenId: "token-1",
      label: "CI bot",
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    }));
    upsertAgentTokenRecordMock.mockResolvedValue(true);
    revokeAgentTokenRecordMock.mockResolvedValue({
      tokenId: "token-1",
    });
  });

  it("mints a token with an explicit expiry after persisting its record", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = requireResponse(
      await POST(
        new Request("http://localhost/api/agents/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expiresAt,
            label: "CI bot",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saved: true,
      token: "token-value",
      tokenId: "token-1",
      label: "CI bot",
      expiresAt: expect.any(String),
    });
    expect(mintAgentTokenMock).toHaveBeenCalledTimes(1);
    expect(upsertAgentTokenRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-1",
        tokenId: "token-1",
      }),
    );
  });

  it("does not expose a token when its authoritative record cannot be saved", async () => {
    upsertAgentTokenRecordMock.mockResolvedValue(false);

    const response = requireResponse(
      await POST(
        new Request("http://localhost/api/agents/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "CI bot" }),
        }),
      ),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      error: "Agent token storage is unavailable. No token was issued.",
    });
    expect(body).not.toHaveProperty("token");
  });

  it("requires the dedicated agent token secret", async () => {
    isAgentTokenConfiguredMock.mockReturnValue(false);

    const response = requireResponse(
      await POST(
        new Request("http://localhost/api/agents/token", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Agent tokens require AGENT_TOKEN_SECRET.",
    });
    expect(mintAgentTokenMock).not.toHaveBeenCalled();
  });

  it("revokes an existing token", async () => {
    const response = requireResponse(
      await DELETE(
        new Request("http://localhost/api/agents/token?tokenId=token-1", {
          method: "DELETE",
        }),
      ),
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

    const postResponse = requireResponse(
      await POST(
        new Request("http://localhost/api/agents/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }),
      ),
    );
    expect(postResponse.status).toBe(403);

    const deleteResponse = requireResponse(
      await DELETE(
        new Request("http://localhost/api/agents/token?tokenId=token-1", {
          method: "DELETE",
        }),
      ),
    );
    expect(deleteResponse.status).toBe(403);
  });

  it("enforces one active agent token on free tier", async () => {
    getUserPlanMock.mockResolvedValue("free");
    countActiveAgentTokensMock.mockResolvedValue(1);

    const response = requireResponse(
      await POST(
        new Request("http://localhost/api/agents/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label: "Second agent",
          }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Free tier allows only one active agent.",
    });
    expect(mintAgentTokenMock).not.toHaveBeenCalled();
  });
});
