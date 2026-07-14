// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { WorkspaceOnboardingDialog } from "@/components/workspace/workspace-onboarding-dialog";
import { buildWorkspaceOnboardingStorageKey } from "@/lib/client/workspace-onboarding";

describe("WorkspaceOnboardingDialog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("stores completion only for the active user", async () => {
    const { rerender } = render(
      <WorkspaceOnboardingDialog onOpenCanvas={() => undefined} userId="user-a" />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-a"))).toBe("1");

    rerender(
      <WorkspaceOnboardingDialog onOpenCanvas={() => undefined} userId="user-b" />,
    );

    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-b"))).toBeNull();
  });

  it("opens the split workspace and can be reopened from the help trigger", async () => {
    const onOpenCanvas = vi.fn();
    render(<WorkspaceOnboardingDialog onOpenCanvas={onOpenCanvas} userId="user-a" />);

    await screen.findByRole("dialog", {
      name: "Turn a question into a structured decision",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open split workspace" }));

    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(buildWorkspaceOnboardingStorageKey("user-a"))).toBe("1");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open workspace guide" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Turn a question into a structured decision",
      }),
    ).toBeTruthy();
  });
});
