// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  SessionUiStateProvider,
  useSessionUiState,
} from "../components/context/session-ui-state";
import { WorkspaceSplitLayout } from "../components/workspace/workspace-split-layout";

function LayoutHarness() {
  const { setViewMode, viewMode } = useSessionUiState();

  return (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <button type="button" onClick={() => setViewMode("chat")}>Show chat</button>
      <button type="button" onClick={() => setViewMode("split")}>Show split</button>
      <button type="button" onClick={() => setViewMode("canvas")}>Show canvas</button>
      <div style={{ width: 1200, height: 800 }}>
        <WorkspaceSplitLayout
          chatPanel={<div data-testid="chat-panel">chat</div>}
          canvasPanel={<div data-testid="canvas-panel">canvas</div>}
        />
      </div>
    </div>
  );
}

function renderLayout(sessionId: string) {
  return render(
    <SessionUiStateProvider sessionId={sessionId}>
      <LayoutHarness />
    </SessionUiStateProvider>,
  );
}

describe("WorkspaceSplitLayout", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("persists the main panel view mode per session", () => {
    const { unmount } = renderLayout("session-a");

    expect(screen.getByTestId("view-mode").textContent).toBe("split");
    expect(screen.queryByTestId("chat-panel")).not.toBeNull();
    expect(screen.queryByTestId("canvas-panel")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show canvas" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");

    unmount();
    renderLayout("session-a");
    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");

    cleanup();
    renderLayout("session-b");
    expect(screen.getByTestId("view-mode").textContent).toBe("split");
  });
});
