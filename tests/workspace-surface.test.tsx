// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProfile } from "../components/auth/sidebar-profile";
import { LlmSettingsProvider } from "../components/context/llm-settings";
import {
  WorkspaceSurfaceProvider,
  useWorkspaceSurface,
} from "../components/context/workspace-surface";
import { LlmModelsWorkspace } from "../components/workspace/llm-models-workspace";

const fetchMock = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        email: "user@example.com",
        id: "user-1",
        name: "Test User",
      },
    },
  }),
}));

vi.stubGlobal("fetch", fetchMock);

function SurfaceHarness() {
  const { activeSurface } = useWorkspaceSurface();

  return (
    <div>
      <SidebarProfile />
      <div data-testid="surface">{activeSurface}</div>
      {activeSurface === "llm-models" ? (
        <LlmModelsWorkspace />
      ) : activeSurface === "knowledge-center" ? (
        <div>
          <h1>Knowledge Center</h1>
          <button type="button">Back</button>
        </div>
      ) : (
        <div>Workspace</div>
      )}
    </div>
  );
}

describe("WorkspaceSurfaceProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json({ settings: null }));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("opens the LLM Models workspace from Profile", async () => {
    const user = userEvent.setup();

    render(
      <LlmSettingsProvider>
        <WorkspaceSurfaceProvider>
          <SurfaceHarness />
        </WorkspaceSurfaceProvider>
      </LlmSettingsProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");

    await user.click(screen.getByRole("button", { name: "LLM Models" }));

    expect(screen.getByTestId("surface").textContent).toBe("llm-models");
    expect(screen.getByRole("heading", { name: "LLM Models" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("opens the Knowledge Center workspace from Profile", async () => {
    const user = userEvent.setup();

    render(
      <LlmSettingsProvider>
        <WorkspaceSurfaceProvider>
          <SurfaceHarness />
        </WorkspaceSurfaceProvider>
      </LlmSettingsProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");

    await user.click(screen.getByRole("button", { name: "Knowledge Center" }));

    expect(screen.getByTestId("surface").textContent).toBe("knowledge-center");
    expect(screen.getByRole("heading", { name: "Knowledge Center" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("forces the main workspace during post-auth handoff", () => {
    localStorage.setItem("nodes.workspace-surface.v1:user-1", "llm-models");
    window.history.replaceState({}, "", "/?handoff=chat");

    render(
      <LlmSettingsProvider>
        <WorkspaceSurfaceProvider>
          <SurfaceHarness />
        </WorkspaceSurfaceProvider>
      </LlmSettingsProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");
  });
});
