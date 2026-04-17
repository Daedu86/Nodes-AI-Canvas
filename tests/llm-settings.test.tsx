// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LlmSettingsProvider,
  useLlmSettings,
} from "../components/context/llm-settings";

const fetchMock = vi.fn();

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
      },
    },
    status: "authenticated",
  }),
}));

vi.stubGlobal("fetch", fetchMock);

function Harness() {
  const {
    availableModelOptions,
    deleteOpenRouterBuiltinModel,
    restoreOpenRouterBuiltinModel,
    setProviderModels,
    toggleOpenRouterModel,
  } = useLlmSettings();

  return (
    <div>
      <div data-testid="options">
        {availableModelOptions.map((option) => `${option.provider}:${option.modelId}`).join("|")}
      </div>
      <button
        type="button"
        onClick={() =>
          toggleOpenRouterModel("nvidia/nemotron-3-nano-30b-a3b:free")
        }
      >
        toggle-openrouter-nano
      </button>
      <button
        type="button"
        onClick={() => deleteOpenRouterBuiltinModel("nvidia/nemotron-3-nano-30b-a3b:free")}
      >
        delete-openrouter-nano
      </button>
      <button
        type="button"
        onClick={() => restoreOpenRouterBuiltinModel("nvidia/nemotron-3-nano-30b-a3b:free")}
      >
        restore-openrouter-nano
      </button>
      <button type="button" onClick={() => setProviderModels("ollama", "gemma3:4b, llama3.2:3b")}>
        models-ollama
      </button>
    </div>
  );
}

describe("LlmSettingsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Response.json({ settings: null });
      }

      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return Response.json({ settings: body.settings ?? null });
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("exposes the built-in OpenRouter and Ollama models by default", async () => {
    render(
      <LlmSettingsProvider>
        <Harness />
      </LlmSettingsProvider>,
    );

    expect((await screen.findByTestId("options")).textContent).toContain(
      "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    );
    expect(screen.getByTestId("options").textContent).toContain("ollama:gemma3:4b");
  });

  it("updates the selector pool when the user customizes model availability", async () => {
    const user = userEvent.setup();

    render(
      <LlmSettingsProvider>
        <Harness />
      </LlmSettingsProvider>,
    );

    await screen.findByTestId("options");

    await user.click(screen.getByRole("button", { name: "toggle-openrouter-nano" }));
    expect(screen.getByTestId("options").textContent).not.toContain(
      "openrouter:nvidia/nemotron-3-nano-30b-a3b:free",
    );

    await user.click(screen.getByRole("button", { name: "delete-openrouter-nano" }));
    expect(screen.getByTestId("options").textContent).not.toContain(
      "openrouter:nvidia/nemotron-3-nano-30b-a3b:free",
    );

    await user.click(screen.getByRole("button", { name: "restore-openrouter-nano" }));
    expect(screen.getByTestId("options").textContent).toContain(
      "openrouter:nvidia/nemotron-3-nano-30b-a3b:free",
    );

    await user.click(screen.getByRole("button", { name: "models-ollama" }));
    expect(screen.getByTestId("options").textContent).toContain("ollama:llama3.2:3b");
  });
});
