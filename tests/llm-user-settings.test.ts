import { describe, expect, it } from "vitest";

import { mergeLlmSettingsState, normalizeLlmSettingsState } from "../lib/llm/user-settings";

describe("llm user settings", () => {
  it("upgrades legacy single openrouter apiKey into apiKeys list", () => {
    const normalized = normalizeLlmSettingsState({
      providers: {
        openrouter: {
          apiKey: "legacy-key",
          enabledModels: ["openrouter/free"],
        },
      },
    });

    expect(normalized.providers.openrouter.apiKeys?.length).toBe(1);
    expect(normalized.providers.openrouter.activeApiKeyId).toBe("legacy-default");
    expect(normalized.providers.openrouter.apiKey).toBe("legacy-key");
  });

  it("preserves stored key material when incoming payload is masked", () => {
    const merged = mergeLlmSettingsState(
      {
        providers: {
          openrouter: {
            activeApiKeyId: "k1",
            apiKey: "secret-1",
            apiKeys: [
              {
                createdAt: "2026-01-01T00:00:00.000Z",
                id: "k1",
                key: "secret-1",
                name: "Primary",
              },
            ],
            enabledModels: ["openrouter/free"],
          },
        },
      },
      {
        providers: {
          openrouter: {
            activeApiKeyId: "k1",
            apiKeys: [
              {
                hasKey: true,
                id: "k1",
                key: "",
                name: "Primary",
              },
            ],
            enabledModels: ["openrouter/free"],
          },
        },
      },
    );

    expect(merged.providers.openrouter.apiKeys?.[0]?.key).toBe("secret-1");
    expect(merged.providers.openrouter.apiKey).toBe("secret-1");
    expect(merged.providers.openrouter.activeApiKeyId).toBe("k1");
  });

  it("excludes the deleted built-in free router from enabled models", () => {
    const normalized = normalizeLlmSettingsState({
      providers: {
        openrouter: {
          deletedModels: ["openrouter/free"],
          enabledModels: [
            "openrouter/free",
          ],
        },
      },
    });

    expect(normalized.providers.openrouter.deletedModels).toContain(
      "openrouter/free",
    );
    expect(normalized.providers.openrouter.enabledModels).toEqual([]);
  });

  it("preserves stored Ollama key material when incoming payload is masked", () => {
    const merged = mergeLlmSettingsState(
      {
        providers: {
          ollama: {
            activeApiKeyId: "ok1",
            apiKey: "ollama-secret",
            apiKeys: [
              {
                createdAt: "2026-01-01T00:00:00.000Z",
                id: "ok1",
                key: "ollama-secret",
                name: "Primary",
              },
            ],
            baseUrl: "https://ollama.com/api",
            enabled: true,
            models: ["gemma3:4b"],
          },
        },
      },
      {
        providers: {
          ollama: {
            activeApiKeyId: "ok1",
            apiKeys: [
              {
                hasKey: true,
                id: "ok1",
                key: "",
                name: "Primary",
              },
            ],
            baseUrl: "https://ollama.com/api",
            enabled: true,
            models: ["gemma3:4b"],
          },
        },
      },
    );

    expect(merged.providers.ollama.apiKeys?.[0]?.key).toBe("ollama-secret");
    expect(merged.providers.ollama.apiKey).toBe("ollama-secret");
    expect(merged.providers.ollama.activeApiKeyId).toBe("ok1");
  });
});
