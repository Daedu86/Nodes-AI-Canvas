// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  SPLIT_WORKSPACE_PANES,
  SessionUiStateProvider,
  useSessionUiState,
} from "../components/context/session-ui-state";

function ModelConfigHarness() {
  const { modelConfig } = useSessionUiState();
  return <div data-testid="model-config">{`${modelConfig.provider}:${modelConfig.modelId}`}</div>;
}

function SplitRatioHarness() {
  const { splitRatio, secondarySplitRatio } = useSessionUiState();
  return <div data-testid="split-ratios">{`${splitRatio.toFixed(2)}:${secondarySplitRatio.toFixed(2)}`}</div>;
}

function SplitPaneHarness() {
  const { splitPaneVisibility } = useSessionUiState();
  return (
    <div data-testid="split-panes">
      {SPLIT_WORKSPACE_PANES.map((pane) => `${pane}:${splitPaneVisibility[pane] ? "open" : "closed"}`).join("|")}
    </div>
  );
}

describe("SessionUiStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("preserves known custom provider model configs from storage", () => {
    localStorage.setItem(
      "session-ui.modelConfig.v1:session-a",
      JSON.stringify({
        provider: "openai",
        modelId: "gpt-5-mini",
      }),
    );

    render(
      <SessionUiStateProvider sessionId="session-a">
        <ModelConfigHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("model-config").textContent).toBe("openai:gpt-5-mini");
  });

  it("falls back when a persisted provider is malformed", () => {
    localStorage.setItem(
      "session-ui.modelConfig.v1:session-a",
      JSON.stringify({
        provider: "unknown-lab",
        modelId: "mystery-model",
      }),
    );

    render(
      <SessionUiStateProvider sessionId="session-a">
        <ModelConfigHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("model-config").textContent).toBe(
      "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    );
  });

  it("upgrades legacy default split ratios to the calmer canvas-first layout", () => {
    localStorage.setItem("session-ui.splitRatio.v2:session-a", String(1 / 3));
    localStorage.setItem("session-ui.secondarySplitRatio.v2:session-a", "0.5");

    render(
      <SessionUiStateProvider sessionId="session-a">
        <SplitRatioHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("split-ratios").textContent).toBe("0.28:0.58");
  });

  it("defaults split mode to all five workspace panes and guards against empty persisted state", () => {
    localStorage.setItem(
      "session-ui.splitPaneVisibility.v1:session-a",
      JSON.stringify({
        chat: false,
        canvas: false,
        wiki: false,
        brief: false,
        nody: false,
      }),
    );

    render(
      <SessionUiStateProvider sessionId="session-a">
        <SplitPaneHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("split-panes").textContent).toBe(
      "chat:closed|canvas:open|wiki:closed|brief:closed|nody:closed",
    );
  });
});
