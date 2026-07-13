import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isE2eEnvAuthAllowed,
  isE2eHeaderAuthAllowed,
  isProductionLikeRuntime,
} from "../lib/server/e2e-auth";

describe("e2e auth guardrails", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows header-based test auth in the test runtime", () => {
    expect(isE2eHeaderAuthAllowed()).toBe(true);
  });

  it("allows header identities in an explicitly enabled non-production E2E server", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_E2E_AUTH_OVERRIDE", "1");
    vi.stubEnv("E2E_MOCK_LLM", "1");

    expect(isE2eEnvAuthAllowed()).toBe(true);
    expect(isE2eHeaderAuthAllowed()).toBe(true);
  });

  it("requires an explicit flag for env-based auth overrides", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_MOCK_LLM", "1");
    expect(isE2eEnvAuthAllowed()).toBe(false);
    vi.stubEnv("ALLOW_E2E_AUTH_OVERRIDE", "1");
    expect(isE2eEnvAuthAllowed()).toBe(true);
  });

  it("blocks all E2E auth overrides in production-like runtimes", () => {
    vi.stubEnv("ALLOW_E2E_AUTH_OVERRIDE", "1");
    vi.stubEnv("E2E_MOCK_LLM", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(isProductionLikeRuntime()).toBe(true);
    expect(isE2eEnvAuthAllowed()).toBe(false);
    expect(isE2eHeaderAuthAllowed()).toBe(false);
  });
});
