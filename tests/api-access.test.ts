import { afterEach, describe, expect, it } from "vitest";
import { enforceLocalApiAccess } from "../lib/server/api-access";

describe("local API access guard", () => {
  afterEach(() => {
    delete process.env.ALLOW_REMOTE_API;
  });

  it("allows loopback requests", async () => {
    const response = enforceLocalApiAccess(
      new Request("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
        },
      }),
    );

    expect(response).toBeNull();
  });

  it("blocks remote hostnames by default", async () => {
    const response = enforceLocalApiAccess(
      new Request("https://example.com/api/sessions", { method: "GET" }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Remote API access is disabled for this local-first workspace.",
    });
  });

  it("blocks cross-origin mutations against localhost", async () => {
    const response = enforceLocalApiAccess(
      new Request("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Cross-origin requests to the API are blocked.",
    });
  });

  it("can be bypassed explicitly for trusted remote deployments", async () => {
    process.env.ALLOW_REMOTE_API = "1";

    const response = enforceLocalApiAccess(
      new Request("https://example.com/api/sessions", { method: "POST" }),
    );

    expect(response).toBeNull();
  });

  it("still blocks cross-site mutations when remote API is allowed", async () => {
    process.env.ALLOW_REMOTE_API = "1";

    const response = enforceLocalApiAccess(
      new Request("https://nodes.example/api/sessions", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "Cross-origin requests to the API are blocked.",
    });
  });
});
