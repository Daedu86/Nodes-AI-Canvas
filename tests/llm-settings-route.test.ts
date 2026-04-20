import { beforeEach, describe, expect, it, vi } from "vitest";

const requireLocalApiUserMock = vi.hoisted(() => vi.fn());
const getLlmSettingsMock = vi.hoisted(() => vi.fn());
const saveLlmSettingsMock = vi.hoisted(() => vi.fn());
const getUserPlanMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/server/request-guards", () => ({
  requireLocalApiUser: requireLocalApiUserMock,
}));

vi.mock("../lib/llm-settings-store", () => ({
  getLlmSettings: getLlmSettingsMock,
  saveLlmSettings: saveLlmSettingsMock,
}));

vi.mock("../lib/user-plan-store", () => ({
  getUserPlan: getUserPlanMock,
}));

import { GET, PUT } from "../app/api/llm/settings/route";

describe("/api/llm/settings", () => {
  beforeEach(() => {
    requireLocalApiUserMock.mockReset();
    getLlmSettingsMock.mockReset();
    saveLlmSettingsMock.mockReset();
    getUserPlanMock.mockReset();
    requireLocalApiUserMock.mockResolvedValue({
      user: {
        email: "test@nodes.local",
        id: "user-1",
        name: "Test User",
      },
    });
    getUserPlanMock.mockResolvedValue("free");
  });

  it("returns saved settings for the authenticated user", async () => {
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        ollama: { baseUrl: "http://localhost:11434/api", enabled: true, models: ["gemma3:4b"] },
        openrouter: {
          apiKey: "sk-openrouter",
          enabledModels: ["openrouter/free"],
          customModels: ["anthropic/claude-3.5-sonnet"],
        },
      },
    });

    const response = await GET(new Request("http://localhost/api/llm/settings"));

    expect(response.status).toBe(200);
    expect(getLlmSettingsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      plan: {
        current: "free",
      },
      settings: expect.objectContaining({
        providers: expect.objectContaining({
          openrouter: expect.objectContaining({
            apiKey: "",
            hasApiKey: true,
            enabledModels: ["openrouter/free"],
            customModels: ["anthropic/claude-3.5-sonnet"],
          }),
        }),
      }),
      policy: {
        openrouter: expect.objectContaining({
          hasDeploymentKey: expect.any(Boolean),
          requireUserKey: expect.any(Boolean),
        }),
      },
    });
  });

  it("preserves an existing saved key when the client sends a masked payload", async () => {
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        ollama: { baseUrl: "http://localhost:11434/api", enabled: true, models: ["gemma3:4b"] },
        openrouter: {
          apiKey: "sk-openrouter",
          enabledModels: ["openrouter/free"],
          customModels: ["anthropic/claude-3.5-sonnet"],
        },
      },
    });
    saveLlmSettingsMock.mockImplementation(async (_ownerId: string, settings: unknown) => settings);

    const response = await PUT(
      new Request("http://localhost/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            providers: {
              openrouter: {
                apiKey: "",
                hasApiKey: true,
                enabledModels: ["openrouter/free"],
                customModels: ["anthropic/claude-3.5-sonnet", "openai/gpt-4.1-mini"],
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
    expect(getLlmSettingsMock).toHaveBeenCalledWith("user-1");
    expect(saveLlmSettingsMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          ollama: expect.objectContaining({
            models: ["gemma3:4b"],
          }),
          openrouter: expect.objectContaining({
            apiKey: "sk-openrouter",
            enabledModels: ["openrouter/free"],
            customModels: ["anthropic/claude-3.5-sonnet", "openai/gpt-4.1-mini"],
          }),
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      plan: {
        current: "free",
      },
      settings: expect.objectContaining({
        providers: expect.objectContaining({
          openrouter: expect.objectContaining({
            apiKey: "",
            hasApiKey: true,
            customModels: ["anthropic/claude-3.5-sonnet", "openai/gpt-4.1-mini"],
          }),
        }),
      }),
      policy: {
        openrouter: expect.objectContaining({
          hasDeploymentKey: expect.any(Boolean),
          requireUserKey: expect.any(Boolean),
        }),
      },
    });
  });

  it("clears a saved key only when clearApiKey is explicit", async () => {
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        ollama: { baseUrl: "http://localhost:11434/api", enabled: true, models: ["gemma3:4b"] },
        openrouter: {
          apiKey: "sk-openrouter",
          enabledModels: ["openrouter/free"],
          customModels: ["anthropic/claude-3.5-sonnet"],
        },
      },
    });
    saveLlmSettingsMock.mockImplementation(async (_ownerId: string, settings: unknown) => settings);

    const response = await PUT(
      new Request("http://localhost/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            providers: {
              openrouter: {
                apiKey: "",
                clearApiKey: true,
                hasApiKey: false,
                enabledModels: ["openrouter/free"],
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
          openrouter: expect.objectContaining({
            apiKey: "",
          }),
        }),
      }),
    );
  });

  it("does not block OpenRouter settings saves when an old Ollama URL is disallowed", async () => {
    getLlmSettingsMock.mockResolvedValue({
      providers: {
        ollama: {
          baseUrl: "https://remote-ollama.example.com/api",
          enabled: true,
          models: ["gemma3:4b"],
        },
        openrouter: {
          apiKey: "sk-openrouter",
          enabledModels: ["openrouter/free"],
          customModels: [],
        },
      },
    });
    saveLlmSettingsMock.mockImplementation(async (_ownerId: string, settings: unknown) => settings);

    const response = await PUT(
      new Request("http://localhost/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            providers: {
              openrouter: {
                enabledModels: [],
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
            baseUrl: "http://localhost:11434/api",
          }),
          openrouter: expect.objectContaining({
            enabledModels: [],
          }),
        }),
      }),
    );
  });
});
