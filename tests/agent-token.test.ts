import { describe, expect, it } from "vitest";
import { mintAgentToken, verifyAgentToken } from "@/lib/server/agent-token";
import { getAuthenticatedUser } from "@/lib/server/auth-user";

describe("agent token auth", () => {
  it("mints and verifies agent tokens", async () => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret";

    const minted = await mintAgentToken({ userId: "agent-user-1", maxAgeSeconds: 60 });
    expect(typeof minted.token).toBe("string");
    expect(typeof minted.tokenId).toBe("string");

    const verified = await verifyAgentToken(minted.token);
    expect(verified?.userId).toBe("agent-user-1");
    expect(verified?.tokenId).toBe(minted.tokenId);
  });

  it("authenticates requests with bearer agent tokens", async () => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret";

    const minted = await mintAgentToken({ userId: "agent-user-2", maxAgeSeconds: 60 });
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
