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
      <button type="button" onClick={() => setViewMode("wiki")}>Show Wiki</button>
      <button type="button" onClick={() => setViewMode("brief")}>Show Brief</button>
      <div style={{ width: 1200, height: 800 }}>
        <WorkspaceSplitLayout
          chatPanel={<div data-testid="chat-panel">chat</div>}
          canvasPanel={<div data-testid="canvas-panel">canvas</div>}
          wikiPanel={<div data-testid="wiki-panel">wiki</div>}
          briefPanel={<div data-testid="brief-panel">brief</div>}
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
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide Brief pane in split" }));
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show Wiki" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    unmount();
    renderLayout("session-a");
    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");

    fireEvent.click(screen.getByRole("button", { name: "Show split" }));
    expect(screen.queryByTestId("chat-panel")).not.toBeNull();
    expect(screen.queryByTestId("canvas-panel")).not.toBeNull();
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    cleanup();
    renderLayout("session-b");
    expect(screen.getByTestId("view-mode").textContent).toBe("split");
    expect(screen.queryByTestId("brief-panel")).not.toBeNull();
  });
});
