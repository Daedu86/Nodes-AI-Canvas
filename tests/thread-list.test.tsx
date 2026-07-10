// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThreadList } from "../components/assistant-ui/thread-list";

const createSession = vi.fn();
const clearActiveProject = vi.fn();
const showWorkspace = vi.fn();
const persistedSessionsContext = {
  activeSessionId: "session-a",
  archiveSession: vi.fn(),
  createSession,
  deleteSession: vi.fn(),
  deleteSessions: vi.fn(),
  isReady: true,
  selectSession: vi.fn(),
  sessions: [
    {
      archived: false,
      createdAt: "2026-04-20T12:00:00.000Z",
      id: "session-a",
      messageCount: 1,
      title: "Session A",
      updatedAt: "2026-04-20T12:00:00.000Z",
    },
  ],
};
const projectsContext = {
  activeProjectId: null,
  clearActiveProject,
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  projects: [],
  selectProject: vi.fn(),
};

type TooltipIconButtonMockProps = React.PropsWithChildren<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }
>;

vi.mock("@/components/context/persisted-sessions", () => ({
  usePersistedSessions: () => persistedSessionsContext,
}));

vi.mock("@/components/context/projects", () => ({
  useProjects: () => projectsContext,
}));

vi.mock("@/components/context/workspace-surface", () => ({
  useWorkspaceSurface: () => ({
    showWorkspace,
  }),
}));

vi.mock("@/components/assistant-ui/tooltip-icon-button", async () => {
  const ReactModule = await import("react");
  return {
    TooltipIconButton: ({ children, tooltip, ...props }: TooltipIconButtonMockProps) =>
      ReactModule.createElement(
        "button",
        {
          type: "button",
          "aria-label": tooltip,
          ...props,
        },
        children,
      ),
  };
});

vi.mock("@/lib/session-persist-sync", () => ({
  forceSessionPersist: vi.fn().mockResolvedValue(undefined),
}));

describe("ThreadList", () => {
  beforeEach(() => {
    createSession.mockReset();
    clearActiveProject.mockReset();
    showWorkspace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("suppresses accidental new-session clicks immediately after leaving manage mode", async () => {
    const now = 1_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const user = userEvent.setup();

    render(<ThreadList />);

    await user.click(screen.getByRole("button", { name: "Manage" }));
    expect(screen.getByRole("button", { name: "Done" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "New session" }));

    expect(showWorkspace).not.toHaveBeenCalled();
    expect(clearActiveProject).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();

    dateNowSpy.mockReturnValue(now + 301);

    await user.click(screen.getByRole("button", { name: "New session" }));

    expect(showWorkspace).toHaveBeenCalledTimes(1);
    expect(clearActiveProject).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
