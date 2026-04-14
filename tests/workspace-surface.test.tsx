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
import { SidebarProvider } from "../components/ui/sidebar";
import { LlmModelsWorkspace } from "../components/workspace/llm-models-workspace";
import { AgentAccessWorkspace } from "../components/workspace/agent-access-workspace";

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
      ) : activeSurface === "agent-access" ? (
        <AgentAccessWorkspace />
      ) : activeSurface === "agent-work" ? (
        <div>
          <h1>Agent Work</h1>
          <button type="button">Back</button>
        </div>
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
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/agents/work")) {
        return Response.json({ agents: [], sessions: [], projects: [], events: [] });
      }
      return Response.json({ settings: null });
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("opens the LLM Models workspace from Profile", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <LlmSettingsProvider>
          <WorkspaceSurfaceProvider>
            <SurfaceHarness />
          </WorkspaceSurfaceProvider>
        </LlmSettingsProvider>
      </SidebarProvider>,
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
      <SidebarProvider>
        <LlmSettingsProvider>
          <WorkspaceSurfaceProvider>
            <SurfaceHarness />
          </WorkspaceSurfaceProvider>
        </LlmSettingsProvider>
      </SidebarProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");

    await user.click(screen.getByRole("button", { name: "Knowledge Center" }));

    expect(screen.getByTestId("surface").textContent).toBe("knowledge-center");
    expect(screen.getByRole("heading", { name: "Knowledge Center" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("opens the Agent Access workspace from Profile", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <LlmSettingsProvider>
          <WorkspaceSurfaceProvider>
            <SurfaceHarness />
          </WorkspaceSurfaceProvider>
        </LlmSettingsProvider>
      </SidebarProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");

    await user.click(screen.getByRole("button", { name: "Agent Access" }));

    expect(screen.getByTestId("surface").textContent).toBe("agent-access");
    expect(screen.getByRole("heading", { name: "Agent Access" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("opens the Agent Work workspace from Profile", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <LlmSettingsProvider>
          <WorkspaceSurfaceProvider>
            <SurfaceHarness />
          </WorkspaceSurfaceProvider>
        </LlmSettingsProvider>
      </SidebarProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");

    await user.click(screen.getByRole("button", { name: "Agent Work" }));

    expect(screen.getByTestId("surface").textContent).toBe("agent-work");
    expect(screen.getByRole("heading", { name: "Agent Work" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeNull();
  });

  it("forces the main workspace during post-auth handoff", () => {
    localStorage.setItem("nodes.workspace-surface.v1:user-1", "llm-models");
    window.history.replaceState({}, "", "/?handoff=chat");

    render(
      <SidebarProvider>
        <LlmSettingsProvider>
          <WorkspaceSurfaceProvider>
            <SurfaceHarness />
          </WorkspaceSurfaceProvider>
        </LlmSettingsProvider>
      </SidebarProvider>,
    );

    expect(screen.getByTestId("surface").textContent).toBe("workspace");
  });
});
