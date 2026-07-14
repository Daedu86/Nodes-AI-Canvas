import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLlmSettings,
  persistLlmSettings,
} from "@/lib/client/llm-settings-client";
import { cloneDefaultLlmSettingsState } from "@/lib/llm/user-settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM settings client", () => {
  it("loads an empty settings snapshot and normalizes policy flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            policy: { openrouter: { hasDeploymentKey: 1, requireUserKey: false } },
            settings: null,
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );

    await expect(fetchLlmSettings()).resolves.toEqual({
      policy: {
        openrouter: { hasDeploymentKey: true, requireUserKey: false },
      },
      settings: null,
    });
  });

  it("persists normalized settings through the shared JSON client", async () => {
    const settings = cloneDefaultLlmSettingsState();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          policy: { openrouter: { hasDeploymentKey: false, requireUserKey: true } },
          settings,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistLlmSettings(settings)).resolves.toEqual({
      policy: {
        openrouter: { hasDeploymentKey: false, requireUserKey: true },
      },
      settings,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/llm/settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("uses an API error message while preserving the typed HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Provider credentials are invalid." }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        }),
      ),
    );

    await expect(persistLlmSettings(cloneDefaultLlmSettingsState())).rejects.toMatchObject({
      message: "Provider credentials are invalid.",
      status: 400,
    });
  });

  it("rejects malformed successful payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ policy: {} }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(fetchLlmSettings()).rejects.toThrow("Invalid LLM settings response.");
  });
});
