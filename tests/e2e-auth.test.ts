import { afterEach, describe, expect, it } from "vitest";
import {
  isE2eEnvAuthAllowed,
  isE2eHeaderAuthAllowed,
  isProductionLikeRuntime,
} from "../lib/server/e2e-auth";

describe("e2e auth guardrails", () => {
  afterEach(() => {
    delete process.env.ALLOW_E2E_AUTH_OVERRIDE;
    delete process.env.VERCEL_ENV;
  });

  it("allows header-based test auth only in test", () => {
    expect(isE2eHeaderAuthAllowed()).toBe(true);
  });

  it("requires an explicit flag for env-based auth overrides", () => {
    expect(isE2eEnvAuthAllowed()).toBe(false);
    process.env.ALLOW_E2E_AUTH_OVERRIDE = "1";
    expect(isE2eEnvAuthAllowed()).toBe(true);
  });

  it("blocks env-based auth overrides in production-like runtimes", () => {
    process.env.ALLOW_E2E_AUTH_OVERRIDE = "1";
    process.env.VERCEL_ENV = "production";

    expect(isProductionLikeRuntime()).toBe(true);
    expect(isE2eEnvAuthAllowed()).toBe(false);
  });
});
