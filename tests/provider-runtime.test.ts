import { beforeEach, describe, expect, it, vi } from "vitest";

const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("ollama-ai-provider", () => ({
  createOllama: vi.fn(),
  ollama: vi.fn(),
}));

import { createLanguageModel } from "../lib/llm/provider-runtime";

describe("provider runtime", () => {
  beforeEach(() => {
    createOpenAIMock.mockReset();
    createOpenAIMock.mockImplementation((settings: Record<string, unknown>) => (modelId: string) => ({
      modelId,
      settings,
    }));
  });

  it("injects OpenRouter fallback models into POST request bodies for non-router models", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createLanguageModel(
      {
        modelId: "google/gemma-4-31b-it:free",
        provider: "openrouter",
      },
      {
        openrouterApiKey: "user-key",
      },
      { userPlan: "free" },
    );

    const settings = createOpenAIMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };
    expect(typeof settings.fetch).toBe("function");

    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
        stream: true,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(forwardedInit.body))).toMatchObject({
      model: "google/gemma-4-31b-it:free",
      models: [
        "nvidia/nemotron-nano-12b-v2-vl:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "openrouter/free",
      ],
    });
  });

  it("does not inject fallback models for the OpenRouter free router", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    createLanguageModel(
      {
        modelId: "openrouter/free",
        provider: "openrouter",
      },
      {
        openrouterApiKey: "user-key",
      },
      { userPlan: "free" },
    );

    const settings = createOpenAIMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };
    await settings.fetch?.("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      body: JSON.stringify({
        model: "openrouter/free",
        stream: true,
      }),
    });

    const forwardedInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(forwardedInit.body))).toEqual({
      model: "openrouter/free",
      stream: true,
    });
  });
});
