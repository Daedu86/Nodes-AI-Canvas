import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAgentTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/persistence/repositories", () => ({
  getAgentWorkRepository: () => ({
    getAgentToken: getAgentTokenMock,
  }),
}));

import {
  isAgentTokenConfigured,
  mintAgentToken,
  verifyAgentToken,
} from "@/lib/server/agent-token";
import { getAuthenticatedUser } from "@/lib/server/auth-user";

const originalAgentTokenSecret = process.env.AGENT_TOKEN_SECRET;

const activeRecord = (params: {
  expiresAt: string;
  ownerId: string;
  tokenId: string;
  label?: string | null;
}) => ({
  createdAt: new Date().toISOString(),
  expiresAt: params.expiresAt,
  label: params.label ?? null,
  lastUsedAt: null,
  ownerId: params.ownerId,
  revoked: false,
  tokenId: params.tokenId,
});

describe("agent token auth", () => {
  beforeEach(() => {
    process.env.AGENT_TOKEN_SECRET = "test-agent-token-secret";
    getAgentTokenMock.mockReset();
  });

  afterEach(() => {
    if (originalAgentTokenSecret === undefined) {
      delete process.env.AGENT_TOKEN_SECRET;
    } else {
      process.env.AGENT_TOKEN_SECRET = originalAgentTokenSecret;
    }
  });

  it("requires a dedicated agent token secret", async () => {
    delete process.env.AGENT_TOKEN_SECRET;

    expect(isAgentTokenConfigured()).toBe(false);
    await expect(
      mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 }),
    ).rejects.toThrow("Missing AGENT_TOKEN_SECRET");
  });

  it("mints and verifies persisted agent tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    expect(typeof minted.token).toBe("string");
    expect(typeof minted.tokenId).toBe("string");

    getAgentTokenMock.mockResolvedValue(
      activeRecord({
        expiresAt: minted.expiresAt,
        ownerId: "agent-user-1",
        tokenId: minted.tokenId,
      }),
    );

    const verified = await verifyAgentToken(minted.token);
    expect(verified?.userId).toBe("agent-user-1");
    expect(verified?.tokenId).toBe(minted.tokenId);
  });

  it("rejects revoked tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue({
      ...activeRecord({
        expiresAt: minted.expiresAt,
        ownerId: "agent-user-1",
        tokenId: minted.tokenId,
      }),
      revoked: true,
    });

    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();
  });

  it("rejects tokens that are missing from authoritative storage", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue(null);

    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();
  });

  it("fails closed when token storage is unavailable", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    getAgentTokenMock.mockRejectedValue(new Error("Supabase unavailable"));

    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();
  });

  it("rejects expired or malformed stored expiry values", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue(
      activeRecord({
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        ownerId: "agent-user-1",
        tokenId: minted.tokenId,
      }),
    );
    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();

    getAgentTokenMock.mockResolvedValue(
      activeRecord({
        expiresAt: "not-a-date",
        ownerId: "agent-user-1",
        tokenId: minted.tokenId,
      }),
    );
    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();
  });

  it("rejects tokens signed with a different agent secret", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    process.env.AGENT_TOKEN_SECRET = "different-agent-token-secret";

    await expect(verifyAgentToken(minted.token)).resolves.toBeNull();
    expect(getAgentTokenMock).not.toHaveBeenCalled();
  });

  it("authenticates requests with active bearer agent tokens", async () => {
    const minted = await mintAgentToken({ userId: "agent-user-2", maxAgeSeconds: 60 });
    getAgentTokenMock.mockResolvedValue(
      activeRecord({
        expiresAt: minted.expiresAt,
        label: "Agent",
        ownerId: "agent-user-2",
        tokenId: minted.tokenId,
      }),
    );

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
