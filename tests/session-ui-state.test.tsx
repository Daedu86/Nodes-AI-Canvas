// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
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

describe("SessionUiStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("normalizes stale persisted model configs to a supported default", () => {
    localStorage.setItem(
      "session-ui.modelConfig.v1:session-a",
      JSON.stringify({
        provider: "openrouter",
        modelId: "qwen/qwen3.6-plus:free",
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
});
