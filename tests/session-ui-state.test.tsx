// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SPLIT_WORKSPACE_PANES,
  SessionUiStateProvider,
  useSessionUiActions,
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

function ViewModeHarness() {
  const { viewMode } = useSessionUiState();
  return <div data-testid="view-mode">{viewMode}</div>;
}

function SplitToggleHarness() {
  const { setViewMode, toggleSplitView, viewMode } = useSessionUiState();

  return (
    <div>
      <div data-testid="toggle-view-mode">{viewMode}</div>
      <button type="button" onClick={() => setViewMode("chat")}>
        Set chat
      </button>
      <button type="button" onClick={() => setViewMode("split")}>
        Enter split directly
      </button>
      <button type="button" onClick={toggleSplitView}>
        Toggle split
      </button>
    </div>
  );
}

function SelectionStateHarness() {
  const { canvasSelectionId, focusedMessageId } = useSessionUiState();
  return (
    <div data-testid="selection-state">
      {`${canvasSelectionId ?? "none"}:${focusedMessageId ?? "none"}`}
    </div>
  );
}

function SelectionActionsHarness({
  onRender,
}: {
  onRender: (actions: ReturnType<typeof useSessionUiActions>) => void;
}) {
  const actions = useSessionUiActions();
  onRender(actions);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          actions.setCanvasSelectionId("node-a");
          actions.setFocusedMessageId("node-a");
        }}
      >
        Select node A
      </button>
      <button
        type="button"
        onClick={() => {
          actions.setCanvasSelectionId((current) =>
            current === "node-a" ? null : current,
          );
          actions.setFocusedMessageId((current) =>
            current === "node-a" ? null : current,
          );
        }}
      >
        Clear node A
      </button>
    </div>
  );
}

describe("SessionUiStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("preserves known custom provider model configs from storage", () => {
    localStorage.setItem(
      "session-ui.modelConfig.v1:session-a",
      JSON.stringify({
        provider: "ollama",
        modelId: "gemma3:4b",
      }),
    );

    render(
      <SessionUiStateProvider sessionId="session-a">
        <ModelConfigHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("model-config").textContent).toBe("ollama:gemma3:4b");
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
      "openrouter:openrouter/free",
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

  it("defaults split mode to both workspace panes and guards against empty persisted state", () => {
    localStorage.setItem(
      "session-ui.splitPaneVisibility.v1:session-a",
      JSON.stringify({
        chat: false,
        canvas: false,
      }),
    );

    render(
      <SessionUiStateProvider sessionId="session-a">
        <SplitPaneHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("split-panes").textContent).toBe(
      "chat:closed|canvas:open",
    );
  });

  it("starts a post-auth landing session in chat mode when no session preference exists", () => {
    window.history.replaceState({}, "", "/?handoff=chat");

    render(
      <SessionUiStateProvider sessionId="session-post-auth">
        <ViewModeHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("view-mode").textContent).toBe("chat");
  });

  it("remembers the last standalone view when split is opened directly and toggled off later", () => {
    const { unmount } = render(
      <SessionUiStateProvider sessionId="session-a">
        <SplitToggleHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("split");

    fireEvent.click(screen.getByRole("button", { name: "Toggle split" }));
    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("canvas");

    fireEvent.click(screen.getByRole("button", { name: "Set chat" }));
    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("chat");

    fireEvent.click(screen.getByRole("button", { name: "Enter split directly" }));
    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("split");

    unmount();

    render(
      <SessionUiStateProvider sessionId="session-a">
        <SplitToggleHarness />
      </SessionUiStateProvider>,
    );

    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("split");

    fireEvent.click(screen.getByRole("button", { name: "Toggle split" }));
    expect(screen.getByTestId("toggle-view-mode").textContent).toBe("chat");
  });

  it("keeps selection actions stable while selection state changes", () => {
    const actionRenders = vi.fn();

    render(
      <SessionUiStateProvider sessionId="session-a">
        <SelectionStateHarness />
        <SelectionActionsHarness onRender={actionRenders} />
      </SessionUiStateProvider>,
    );

    expect(actionRenders).toHaveBeenCalledTimes(1);
    const firstActions = actionRenders.mock.calls[0]?.[0];

    fireEvent.click(screen.getByRole("button", { name: "Select node A" }));
    expect(screen.getByTestId("selection-state").textContent).toBe(
      "node-a:node-a",
    );
    expect(actionRenders).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear node A" }));
    expect(screen.getByTestId("selection-state").textContent).toBe("none:none");
    expect(actionRenders).toHaveBeenCalledTimes(1);
    expect(actionRenders.mock.calls[0]?.[0]).toBe(firstActions);
  });
});
