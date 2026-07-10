// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
