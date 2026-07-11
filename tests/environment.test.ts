import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../lib/server/environment";

const secret = (character: string) => character.repeat(48);

const validProductionEnvironment = () => ({
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  AUTH_SECRET: secret("a"),
  NEXTAUTH_URL: "https://nodes.example.com",
  AUTH_GITHUB_ID: "github-client-id",
  AUTH_GITHUB_SECRET: secret("g"),
  AUTH_ENABLE_AGENT_TOKEN_LOGIN: "0",
  AUTH_ENABLE_DEV_CREDENTIALS: "0",
  NODES_PERSISTENCE_BACKEND: "supabase",
  ALLOW_REMOTE_API: "1",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: secret("s"),
  LLM_SETTINGS_ENCRYPTION_KEY: secret("e"),
  OPENROUTER_ALLOW_DEPLOYMENT_KEY: "0",
  OPENROUTER_REQUIRE_USER_KEY: "1",
  NEXT_PUBLIC_DEFAULT_PROVIDER: "openrouter",
});

describe("validateEnvironment", () => {
  it("keeps local file-backed development valid", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "development",
        NODES_PERSISTENCE_BACKEND: "file",
        AUTH_ENABLE_DEV_CREDENTIALS: "1",
      }).errors,
    ).toEqual([]);
  });

  it("accepts a complete production configuration", () => {
    expect(validateEnvironment(validProductionEnvironment())).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("rejects file persistence and local auth configuration in production", () => {
    const result = validateEnvironment({
      ...validProductionEnvironment(),
      NODES_PERSISTENCE_BACKEND: "file",
      ALLOW_REMOTE_API: "0",
      AUTH_ENABLE_DEV_CREDENTIALS: "1",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Production requires NODES_PERSISTENCE_BACKEND=supabase.",
        "Production requires ALLOW_REMOTE_API=1 with Supabase persistence.",
        "AUTH_ENABLE_DEV_CREDENTIALS must be 0 in production.",
        "NEXTAUTH_URL must use https in production.",
        "NEXTAUTH_URL cannot point to a loopback host in production.",
      ]),
    );
  });

  it("rejects incomplete OAuth provider pairs", () => {
    const result = validateEnvironment({
      ...validProductionEnvironment(),
      AUTH_GITHUB_SECRET: "",
    });

    expect(result.errors).toContain(
      "GitHub OAuth requires both AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.",
    );
    expect(result.errors).toContain(
      "Production requires at least one human OAuth provider: GitHub or Google.",
    );
  });

  it("requires a dedicated agent secret when web login is enabled", () => {
    const result = validateEnvironment({
      ...validProductionEnvironment(),
      AUTH_ENABLE_AGENT_TOKEN_LOGIN: "1",
      AGENT_TOKEN_SECRET: "",
    });

    expect(result.errors).toContain(
      "AUTH_ENABLE_AGENT_TOKEN_LOGIN=1 requires AGENT_TOKEN_SECRET.",
    );
  });

  it("rejects reused secrets and contradictory OpenRouter flags", () => {
    const shared = secret("x");
    const result = validateEnvironment({
      ...validProductionEnvironment(),
      AUTH_SECRET: shared,
      LLM_SETTINGS_ENCRYPTION_KEY: shared,
      AGENT_TOKEN_SECRET: shared,
      OPENROUTER_ALLOW_DEPLOYMENT_KEY: "1",
      OPENROUTER_REQUIRE_USER_KEY: "1",
      OPENROUTER_API_KEY: secret("o"),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "The LLM settings encryption key must not reuse the Auth.js secret.",
        "AGENT_TOKEN_SECRET must not reuse the Auth.js secret.",
        "AGENT_TOKEN_SECRET must not reuse the LLM settings encryption key.",
        "OPENROUTER_ALLOW_DEPLOYMENT_KEY and OPENROUTER_REQUIRE_USER_KEY cannot both be 1.",
      ]),
    );
  });

  it("warns when production encryption still uses the Auth.js fallback", () => {
    const environment = {
      ...validProductionEnvironment(),
      LLM_SETTINGS_ENCRYPTION_KEY: undefined,
    };

    expect(validateEnvironment(environment).warnings).toEqual([
      "LLM settings encryption is falling back to the Auth.js secret; configure LLM_SETTINGS_ENCRYPTION_KEY for independent key rotation.",
    ]);
  });
});
