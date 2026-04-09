import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLocalApiUserMock = vi.hoisted(() => vi.fn());
const getLlmSettingsMock = vi.hoisted(() => vi.fn());
const saveLlmSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/server/request-guards", () => ({
  requireLocalApiUser: requireLocalApiUserMock,
}));

vi.mock("../lib/llm-settings-store", () => ({
  getLlmSettings: getLlmSettingsMock,
  saveLlmSettings: saveLlmSettingsMock,
}));

import { GET, PUT } from "../app/api/llm/settings/route";

describe("/api/llm/settings", () => {
  beforeEach(() => {
    requireLocalApiUserMock.mockReset();
    getLlmSettingsMock.mockReset();
    saveLlmSettingsMock.mockReset();
    requireLocalApiUserMock.mockResolvedValue({
      user: {
        email: "test@nodes.local",
        id: "user-1",
        name: "Test User",
      },
    });
  });

  it("returns saved settings for the authenticated user", async () => {
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        anthropic: { apiKey: "", enabled: false, models: [] },
        google: { apiKey: "", enabled: false, models: [] },
        ollama: { baseUrl: "http://localhost:11434/api", enabled: true, models: ["gemma3:4b"] },
        openai: { apiKey: "sk-openai", enabled: true, models: ["gpt-5-mini"] },
        openrouter: { apiKey: "", enabledModels: ["openrouter/free"] },
      },
    });

    const response = await GET(new Request("http://localhost/api/llm/settings"));

    expect(response.status).toBe(200);
    expect(getLlmSettingsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      settings: expect.objectContaining({
        providers: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
            models: ["gpt-5-mini"],
          }),
        }),
      }),
    });
  });

  it("normalizes and saves submitted settings", async () => {
    saveLlmSettingsMock.mockImplementation(async (_ownerId: string, settings: unknown) => settings);

    const response = await PUT(
      new Request("http://localhost/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            providers: {
              openai: {
                apiKey: "sk-openai",
                enabled: true,
                models: ["gpt-5-mini", "gpt-5-mini", "gpt-4.1-mini"],
              },
              ollama: {
                baseUrl: "http://localhost:11434/api",
                enabled: true,
                models: [],
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(saveLlmSettingsMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          ollama: expect.objectContaining({
            models: ["gemma3:4b"],
          }),
          openai: expect.objectContaining({
            models: ["gpt-5-mini", "gpt-4.1-mini"],
          }),
        }),
      }),
    );
  });
});
