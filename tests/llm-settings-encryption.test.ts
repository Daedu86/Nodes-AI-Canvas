import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LlmSettingsState } from "../lib/llm/user-settings";
import {
  decryptLlmSettingsCredentials,
  encryptLlmSettingsCredentials,
} from "../lib/server/llm-settings-encryption";

const originalEnvironment = {
  AUTH_SECRET: process.env.AUTH_SECRET,
  LLM_SETTINGS_ENCRYPTION_KEY: process.env.LLM_SETTINGS_ENCRYPTION_KEY,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY,
};

const restoreEnvironmentValue = (name: keyof typeof originalEnvironment) => {
  const value = originalEnvironment[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

const createSettings = (): LlmSettingsState => ({
  providers: {
    ollama: {
      activeApiKeyId: "ollama-primary",
      apiKey: "ollama-secret",
      apiKeys: [
        {
          createdAt: "2026-07-11T00:00:00.000Z",
          id: "ollama-primary",
          key: "ollama-secret",
          name: "Local Ollama",
        },
      ],
      baseUrl: "http://localhost:11434/api",
      enabled: true,
      models: ["gemma3:4b"],
    },
    openrouter: {
      activeApiKeyId: "openrouter-primary",
      apiKey: "openrouter-secret",
      apiKeys: [
        {
          createdAt: "2026-07-11T00:00:00.000Z",
          id: "openrouter-primary",
          key: "openrouter-secret",
          name: "Primary OpenRouter",
        },
      ],
      customModels: ["anthropic/claude-3.5-sonnet"],
      deletedModels: [],
      enabledModels: ["openrouter/free"],
    },
  },
});

describe("LLM settings credential encryption", () => {
  beforeEach(() => {
    process.env.LLM_SETTINGS_ENCRYPTION_KEY = "test-llm-settings-encryption-secret";
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  afterEach(() => {
    restoreEnvironmentValue("AUTH_SECRET");
    restoreEnvironmentValue("LLM_SETTINGS_ENCRYPTION_KEY");
    restoreEnvironmentValue("NEXTAUTH_SECRET");
    restoreEnvironmentValue("SETTINGS_ENCRYPTION_KEY");
  });

  it("encrypts only credentials and restores the original settings", () => {
    const settings = createSettings();
    const stored = encryptLlmSettingsCredentials("user-1", settings);
    const serialized = JSON.stringify(stored);

    expect(serialized).not.toContain("openrouter-secret");
    expect(serialized).not.toContain("ollama-secret");
    expect(stored).toMatchObject({
      providers: {
        openrouter: {
          customModels: ["anthropic/claude-3.5-sonnet"],
          enabledModels: ["openrouter/free"],
        },
      },
    });

    const decoded = decryptLlmSettingsCredentials("user-1", stored);
    expect(decoded.hasLegacyPlaintextCredentials).toBe(false);
    expect(decoded.settings).toEqual(settings);
  });

  it("rejects ciphertext tampering", () => {
    const stored = encryptLlmSettingsCredentials("user-1", createSettings()) as {
      providers: {
        openrouter: {
          apiKey: { data: string };
        };
      };
    };
    const ciphertext = Buffer.from(stored.providers.openrouter.apiKey.data, "base64");
    ciphertext[0] = ciphertext[0]! ^ 1;
    stored.providers.openrouter.apiKey.data = ciphertext.toString("base64");

    expect(() => decryptLlmSettingsCredentials("user-1", stored)).toThrow(
      "Failed to decrypt LLM credential",
    );
  });

  it("binds encrypted credentials to their owner", () => {
    const stored = encryptLlmSettingsCredentials("user-1", createSettings());

    expect(() => decryptLlmSettingsCredentials("user-2", stored)).toThrow(
      "Failed to decrypt LLM credential",
    );
  });

  it("reads legacy plaintext and encrypts it on the next write", () => {
    const legacySettings = createSettings();
    const decoded = decryptLlmSettingsCredentials("user-1", legacySettings);

    expect(decoded.hasLegacyPlaintextCredentials).toBe(true);
    expect(decoded.settings).toEqual(legacySettings);

    const migrated = encryptLlmSettingsCredentials(
      "user-1",
      decoded.settings as LlmSettingsState,
    );
    const serialized = JSON.stringify(migrated);
    expect(serialized).not.toContain("openrouter-secret");
    expect(serialized).not.toContain("ollama-secret");
  });

  it("derives a storage key from AUTH_SECRET when no dedicated key is configured", () => {
    delete process.env.LLM_SETTINGS_ENCRYPTION_KEY;
    process.env.AUTH_SECRET = "existing-auth-secret";

    const stored = encryptLlmSettingsCredentials("user-1", createSettings());
    expect(decryptLlmSettingsCredentials("user-1", stored).settings).toEqual(
      createSettings(),
    );
  });

  it("fails closed when credentials exist but no server secret is configured", () => {
    delete process.env.LLM_SETTINGS_ENCRYPTION_KEY;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => encryptLlmSettingsCredentials("user-1", createSettings())).toThrow(
      "LLM credential encryption requires",
    );
  });
});
