// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentAccessWorkspace } from "../components/workspace/agent-access-workspace";

const fetchMock = vi.fn();
const showAgentWorkMock = vi.fn();
const showWorkspaceMock = vi.fn();

vi.mock("../components/context/workspace-surface", () => ({
  useWorkspaceSurface: () => ({
    showAgentWork: showAgentWorkMock,
    showWorkspace: showWorkspaceMock,
  }),
}));

vi.stubGlobal("fetch", fetchMock);

describe("AgentAccessWorkspace", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    showAgentWorkMock.mockReset();
    showWorkspaceMock.mockReset();
    fetchMock.mockResolvedValue(
      Response.json({
        saved: true,
        token: "token-value",
        tokenId: "token-1",
        label: "CI bot",
        expiresAt: "2026-04-25T10:30:00.000Z",
      }),
    );
  });

  it("creates a token with an explicit expiry and confirms it was saved", async () => {
    const user = userEvent.setup();
    render(<AgentAccessWorkspace />);

    await user.type(screen.getByPlaceholderText("e.g. GitHub bot, nightly agent…"), "CI bot");
    const expiryInput = screen.getByLabelText("Expiry date");
    fireEvent.change(expiryInput, { target: { value: "2026-04-25T12:30" } });

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { expiresAt: string; label: string };
    expect(body.label).toBe("CI bot");
    expect(body.expiresAt).toMatch(/^2026-04-25T/);

    expect(await screen.findByText("Token saved to Agent Work")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Open Agent Work" }));
    expect(showAgentWorkMock).toHaveBeenCalledTimes(1);
  });
});
