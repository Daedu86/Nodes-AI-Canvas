import { beforeEach, describe, expect, it, vi } from "vitest";

const getAgentTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/persistence/repositories", () => ({
  getAgentWorkRepository: () => ({
    getAgentToken: getAgentTokenMock,
  }),
}));

import { mintAgentToken, verifyAgentToken } from "@/lib/server/agent-token";
import { getAuthenticatedUser } from "@/lib/server/auth-user";

describe("agent token auth", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret";
    getAgentTokenMock.mockReset();
    getAgentTokenMock.mockResolvedValue({
      createdAt: "2026-04-21T09:00:00.000Z",
      expiresAt: "2026-04-21T10:00:00.000Z",
      label: "CI bot",
      lastUsedAt: null,
      ownerId: "agent-user-1",
      revoked: false,
      tokenId: "placeholder",
    });
  });

  it("mints and verifies persisted agent tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    expect(typeof minted.token).toBe("string");
    expect(typeof minted.tokenId).toBe("string");

    getAgentTokenMock.mockResolvedValue({
      createdAt: "2026-04-21T09:00:00.000Z",
      expiresAt: minted.expiresAt,
      label: null,
      lastUsedAt: null,
      ownerId: "agent-user-1",
      revoked: false,
      tokenId: minted.tokenId,
    });

    const verified = await verifyAgentToken(minted.token);
    expect(verified?.userId).toBe("agent-user-1");
    expect(verified?.tokenId).toBe(minted.tokenId);
  });

  it("rejects revoked tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue({
      createdAt: "2026-04-21T09:00:00.000Z",
      expiresAt: minted.expiresAt,
      label: null,
      lastUsedAt: null,
      ownerId: "agent-user-1",
      revoked: true,
      tokenId: minted.tokenId,
    });

    const verified = await verifyAgentToken(minted.token);
    expect(verified).toBeNull();
  });

  it("authenticates requests with active bearer agent tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-2", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue({
      createdAt: "2026-04-21T09:00:00.000Z",
      expiresAt: minted.expiresAt,
      label: "Agent",
      lastUsedAt: null,
      ownerId: "agent-user-2",
      revoked: false,
      tokenId: minted.tokenId,
    });

    const req = new Request("http://localhost/api/sessions", {
      headers: {
        "x-test-auth": "none",
        authorization: `Bearer ${minted.token}`,
      },
    });

    const user = await getAuthenticatedUser(req);
    expect(user?.id).toBe("agent-user-2");
    expect(user?.isAgent).toBe(true);
  });
});
