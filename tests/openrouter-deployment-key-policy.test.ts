import { describe, expect, it } from "vitest";

import { getMissingProviderCredential } from "../lib/llm/provider-runtime";

describe("OpenRouter deployment key policy", () => {
  it("requires a user key for free users by default", () => {
    const original = { ...process.env };
    try {
      process.env.OPENROUTER_API_KEY = "deployment-key";
      delete process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY;
      delete process.env.OPENROUTER_REQUIRE_USER_KEY;

      const missing = getMissingProviderCredential("openrouter", {}, { userPlan: "free" });
      expect(missing?.code).toBe("missing_openrouter_key");
      expect(missing?.status).toBe(401);
    } finally {
      process.env = original;
    }
  });

  it("allows a deployment key for paid users only when OPENROUTER_ALLOW_DEPLOYMENT_KEY=1", () => {
    const original = { ...process.env };
    try {
      process.env.OPENROUTER_API_KEY = "deployment-key";
      process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY = "1";
      process.env.OPENROUTER_REQUIRE_USER_KEY = "0";

      const missing = getMissingProviderCredential("openrouter", {}, { userPlan: "paid" });
      expect(missing).toBeNull();
    } finally {
      process.env = original;
    }
  });
});
