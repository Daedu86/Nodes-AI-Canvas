// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../components/theme/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders only the icon in an icon-sized button", async () => {
    const user = userEvent.setup();

    render(<ThemeToggle size="icon" />);

    const toggle = screen.getByRole("button", { name: "Switch to light mode" });
    expect(toggle.textContent).toBe("");
    expect(toggle.getAttribute("title")).toBe("Switch to light mode");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Switch to dark mode" }).textContent).toBe("");
  });

  it("keeps the text label for regular buttons", () => {
    render(<ThemeToggle size="sm" />);

    expect(screen.getByText("Light")).not.toBeNull();
  });

  it("hydrates without recovering when a persisted light theme exists", async () => {
    const browserWindow = window;
    vi.stubGlobal("window", undefined);
    const serverMarkup = renderToString(<ThemeToggle size="icon" />);
    vi.stubGlobal("window", browserWindow);

    localStorage.setItem("theme", "light");
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const onRecoverableError = vi.fn();

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <ThemeToggle size="icon" />, { onRecoverableError });
      await Promise.resolve();
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).not.toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
