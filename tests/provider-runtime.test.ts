import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createOpenAIMock, getLlmSettingsMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  getLlmSettingsMock: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@/lib/llm-settings-store", () => ({
  getLlmSettings: getLlmSettingsMock,
}));

import {
  createLanguageModel,
  getMissingProviderCredential,
  getUserModelOverrides,
} from "../lib/llm/provider-runtime";

const originalDeploymentKey = process.env.OPENROUTER_API_KEY;
const originalAllowDeploymentKey = process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY;
const originalRequireUserKey = process.env.OPENROUTER_REQUIRE_USER_KEY;

const restoreEnvironment = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const createFetchMock = () =>
  vi.fn<typeof fetch>(async (input, init) => {
    void input;
    void init;
    return new Response(null, { status: 200 });
  });

const gemmaConfig = {
  modelId: "google/gemma-4-31b-it:free",
  provider: "openrouter" as const,
};

describe("provider runtime", () => {
  beforeEach(() => {
    createOpenAIMock.mockReset();
    getLlmSettingsMock.mockReset();
    createOpenAIMock.mockImplementation((settings: Record<string, unknown>) => ({
      chat: (modelId: string) => ({
        modelId,
        settings,
      }),
    }));
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY;
    delete process.env.OPENROUTER_REQUIRE_USER_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnvironment("OPENROUTER_API_KEY", originalDeploymentKey);
    restoreEnvironment("OPENROUTER_ALLOW_DEPLOYMENT_KEY", originalAllowDeploymentKey);
    restoreEnvironment("OPENROUTER_REQUIRE_USER_KEY", originalRequireUserKey);
  });

  it("injects OpenRouter fallback models into POST request bodies for non-router models", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    createLanguageModel(
      gemmaConfig,
      { openrouterApiKey: "user-key" },
      { userPlan: "free" },
    );

    const settings = createOpenAIMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };
    expect(typeof settings.fetch).toBe("function");

    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      body: JSON.stringify({
        model: gemmaConfig.modelId,
        input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
        stream: true,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(forwardedInit?.body))).toMatchObject({
      model: gemmaConfig.modelId,
      models: ["openrouter/free"],
    });
  });

  it("does not inject fallback models for the OpenRouter free router", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    createLanguageModel(
      { modelId: "openrouter/free", provider: "openrouter" },
      { openrouterApiKey: "user-key" },
      { userPlan: "free" },
    );

    const settings = createOpenAIMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };
    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      body: JSON.stringify({ model: "openrouter/free", stream: true }),
    });

    const forwardedInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(forwardedInit?.body))).toEqual({
      model: "openrouter/free",
      stream: true,
    });
  });

  it("passes through requests that must not be rewritten", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    createLanguageModel(
      gemmaConfig,
      { openrouterApiKey: "user-key" },
      { userPlan: "free" },
    );
    const settings = createOpenAIMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };

    const existingModelsBody = JSON.stringify({
      model: gemmaConfig.modelId,
      models: ["custom/fallback"],
    });
    const differentModelBody = JSON.stringify({ model: "openrouter/free" });

    await settings.fetch?.("https://openrouter.ai/api/v1/models", { method: "GET" });
    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      body: "{",
      method: "POST",
    });
    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      body: existingModelsBody,
      method: "POST",
    });
    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      body: differentModelBody,
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe("{");
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(existingModelsBody);
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(differentModelBody);
  });

  it("selects active, first, legacy, or empty user credentials in order", async () => {
    const baseSettings = {
      providers: {
        ollama: {
          apiKey: "",
          apiKeys: [],
          baseUrl: "http://localhost:11434/api",
          enabled: false,
          models: [],
        },
        openrouter: {
          activeApiKeyId: "secondary",
          apiKey: " legacy-key ",
          apiKeys: [
            { id: "primary", key: " first-key ", name: "Primary" },
            { id: "secondary", key: " second-key ", name: "Secondary" },
          ],
          enabledModels: [],
        },
      },
    };

    getLlmSettingsMock
      .mockResolvedValueOnce(baseSettings)
      .mockResolvedValueOnce({
        ...baseSettings,
        providers: {
          ...baseSettings.providers,
          openrouter: {
            ...baseSettings.providers.openrouter,
            activeApiKeyId: "missing",
          },
        },
      })
      .mockResolvedValueOnce({
        ...baseSettings,
        providers: {
          ...baseSettings.providers,
          openrouter: {
            ...baseSettings.providers.openrouter,
            apiKeys: [],
          },
        },
      })
      .mockResolvedValueOnce(null);

    await expect(getUserModelOverrides("user-1")).resolves.toEqual({
      openrouterApiKey: "second-key",
    });
    await expect(getUserModelOverrides("user-2")).resolves.toEqual({
      openrouterApiKey: "first-key",
    });
    await expect(getUserModelOverrides("user-3")).resolves.toEqual({
      openrouterApiKey: "legacy-key",
    });
    await expect(getUserModelOverrides("user-4")).resolves.toEqual({
      openrouterApiKey: undefined,
    });
  });

  it("enforces plan-aware provider credential policy", () => {
    expect(
      getMissingProviderCredential("openrouter", {}, { userPlan: "free" }),
    ).toMatchObject({ code: "missing_openrouter_key", status: 401 });

    expect(
      getMissingProviderCredential(
        "openrouter",
        { openrouterApiKey: " user-key " },
        { userPlan: "free" },
      ),
    ).toBeNull();

    process.env.OPENROUTER_API_KEY = "deployment-key";
    process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY = "1";
    process.env.OPENROUTER_REQUIRE_USER_KEY = "0";

    expect(
      getMissingProviderCredential("openrouter", {}, { userPlan: "paid" }),
    ).toBeNull();
    expect(
      getMissingProviderCredential("openrouter", {}, { userPlan: "free" }),
    ).toMatchObject({ status: 401 });
    expect(getMissingProviderCredential("ollama", {}, { userPlan: "paid" })).toEqual({
      code: "missing_ollama_key",
      message: "Ollama has been disabled for this deployment.",
      status: 410,
    });
  });

  it("throws before model creation when the provider cannot run", () => {
    expect(() =>
      createLanguageModel(gemmaConfig, {}, { userPlan: "free" }),
    ).toThrow("Missing OpenRouter API key");

    expect(() =>
      createLanguageModel(
        { modelId: "gemma3:4b", provider: "ollama" },
        {},
        { userPlan: "paid" },
      ),
    ).toThrow("Ollama has been disabled for this deployment.");
  });
});
