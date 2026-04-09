// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LlmSettingsProvider,
  useLlmSettings,
} from "../components/context/llm-settings";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
      },
    },
  }),
}));

function Harness() {
  const {
    availableModelOptions,
    setProviderApiKey,
    setProviderEnabled,
    setProviderModels,
  } = useLlmSettings();

  return (
    <div>
      <div data-testid="options">
        {availableModelOptions.map((option) => `${option.provider}:${option.modelId}`).join("|")}
      </div>
      <button type="button" onClick={() => setProviderEnabled("openai", true)}>
        enable-openai
      </button>
      <button type="button" onClick={() => setProviderApiKey("openai", "sk-test")}>
        key-openai
      </button>
      <button
        type="button"
        onClick={() => setProviderModels("openai", "gpt-5-mini, gpt-4.1-mini")}
      >
        models-openai
      </button>
    </div>
  );
}

describe("LlmSettingsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("exposes the built-in OpenRouter and Ollama models by default", () => {
    render(
      <LlmSettingsProvider>
        <Harness />
      </LlmSettingsProvider>,
    );

    expect(screen.getByTestId("options").textContent).toContain(
      "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    );
    expect(screen.getByTestId("options").textContent).toContain("ollama:gemma3:4b");
  });

  it("adds configured OpenAI models to the selector pool", async () => {
    const user = userEvent.setup();

    render(
      <LlmSettingsProvider>
        <Harness />
      </LlmSettingsProvider>,
    );

    await user.click(screen.getByRole("button", { name: "enable-openai" }));
    await user.click(screen.getByRole("button", { name: "key-openai" }));
    await user.click(screen.getByRole("button", { name: "models-openai" }));

    expect(screen.getByTestId("options").textContent).toContain("openai:gpt-5-mini");
    expect(screen.getByTestId("options").textContent).toContain("openai:gpt-4.1-mini");
  });
});
