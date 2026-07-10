// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_BLOCK_DRAG_MIME,
  CanvasBlockLibrary,
} from "@/components/assistant-ui/thread-graph-flow/block-library";

afterEach(() => cleanup());

describe("CanvasBlockLibrary", () => {
  it("shows the initial categories and contains no legacy template heading", () => {
    render(
      <CanvasBlockLibrary collapsed={false} onAddBlock={() => undefined} onCollapsedChange={() => undefined} />,
    );

    expect(screen.getByText("Process")).toBeTruthy();
    expect(screen.getByText("Inputs")).toBeTruthy();
    expect(screen.getByText("Outputs")).toBeTruthy();
    expect(screen.queryByText(/Artifact templates/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Add Table block" })).toBeTruthy();
  });

  it("filters blocks, supports click-to-add, and toggles the panel", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    const onCollapsedChange = vi.fn();
    render(
      <CanvasBlockLibrary
        collapsed={false}
        onAddBlock={onAddBlock}
        onCollapsedChange={onCollapsedChange}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Search blocks" }), "plan");
    expect(screen.getByRole("button", { name: "Add Plan block" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Code block" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add Plan block" }));
    expect(onAddBlock).toHaveBeenCalledWith(expect.objectContaining({ id: "output-plan" }));

    await user.click(screen.getByRole("button", { name: "Collapse block library" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("supports keyboard activation and publishes drag data", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(
      <CanvasBlockLibrary collapsed={false} onAddBlock={onAddBlock} onCollapsedChange={() => undefined} />,
    );

    const textButton = screen.getByRole("button", { name: "Add Text block" });
    textButton.focus();
    await user.keyboard("{Enter}");
    expect(onAddBlock).toHaveBeenCalledWith(expect.objectContaining({ id: "input-text" }));

    const setData = vi.fn();
    fireEvent.dragStart(textButton, {
      dataTransfer: { effectAllowed: "none", setData },
    });
    expect(setData).toHaveBeenCalledWith(CANVAS_BLOCK_DRAG_MIME, "input-text");
  });

  it("renders a compact accessible rail when collapsed", () => {
    render(
      <CanvasBlockLibrary collapsed onAddBlock={() => undefined} onCollapsedChange={() => undefined} />,
    );

    expect(
      screen.getByRole("button", { name: "Expand block library" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Add Prompt block" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search blocks" })).toBeNull();
  });
});
