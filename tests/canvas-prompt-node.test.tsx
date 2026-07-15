// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type }: { type: string }) => <span data-testid={`handle-${type}`} />,
  Position: {
    Left: "left",
    Right: "right",
  },
}));

import { CanvasPromptNode } from "../components/assistant-ui/thread-graph-flow/canvas-prompt-node";
import type { ThreadGraphFlowNodeData } from "../components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const baseDetail = {
  operation: "create-follow-up-prompt" as const,
  title: "Add follow-up question",
  description: "Ask a new follow-up question beneath this assistant reply.",
  placeholder: "Write a follow-up question...",
  submitLabel: "Add follow-up",
};

const renderPromptNode = (overrides: Partial<ThreadGraphFlowNodeData> = {}) => {
  const onDraftCancel = vi.fn();
  const onDraftSubmit = vi.fn();
  const onDraftTextChange = vi.fn();
  const data: ThreadGraphFlowNodeData = {
    draftContextScope: "branch",
    draftDetail: baseDetail,
    draftText: "Initial prompt",
    kind: "prompt-draft",
    preview: "Initial prompt",
    role: "draft",
    onDraftCancel,
    onDraftSubmit,
    onDraftTextChange,
    ...overrides,
  };

  render(
    <CanvasPromptNode
      {...({
        data,
        dragging: false,
        selected: false,
      } as React.ComponentProps<typeof CanvasPromptNode>)}
    />,
  );

  return { data, onDraftCancel, onDraftSubmit, onDraftTextChange };
};

describe("CanvasPromptNode", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a canvas draft composer with controls and hint", () => {
    renderPromptNode();

    expect(screen.getByText("Draft prompt")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Draft prompt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send prompt node" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete draft/i })).toBeTruthy();
    expect(screen.getByText("Enter sends, Shift+Enter adds newline")).toBeTruthy();
  });

  it("supports typing through the draft text callback", () => {
    const { onDraftTextChange } = renderPromptNode();

    fireEvent.change(screen.getByRole("textbox", { name: "Draft prompt" }), {
      target: { value: "New canvas prompt" },
    });

    expect(onDraftTextChange).toHaveBeenCalledWith("New canvas prompt");
  });

  it("submits on Enter and keeps Shift+Enter for newlines", () => {
    const { onDraftSubmit } = renderPromptNode();
    const textbox = screen.getByRole("textbox", { name: "Draft prompt" });

    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });
    expect(onDraftSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: false });
    expect(onDraftSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits from the Send button and cancels from Delete draft", () => {
    const { onDraftCancel, onDraftSubmit } = renderPromptNode();

    fireEvent.click(screen.getByRole("button", { name: "Send prompt node" }));
    fireEvent.click(screen.getByRole("button", { name: /Delete draft/i }));

    expect(onDraftSubmit).toHaveBeenCalledTimes(1);
    expect(onDraftCancel).toHaveBeenCalledTimes(1);
  });

  it("requires a context scope before Run", () => {
    const onDraftContextScopeChange = vi.fn();
    const { onDraftSubmit } = renderPromptNode({
      draftContextScope: null,
      onDraftContextScopeChange,
    });

    expect((screen.getByRole("button", { name: "Send prompt node" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Choose context to enable Run.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tree" } });
    expect(onDraftContextScopeChange).toHaveBeenCalledWith("tree");
    fireEvent.click(screen.getByRole("button", { name: "Send prompt node" }));
    expect(onDraftSubmit).not.toHaveBeenCalled();
  });

  it("disables editing and submit while busy or when AI is disabled", () => {
    renderPromptNode({ draftBusy: true });

    expect((screen.getByRole("textbox", { name: "Draft prompt" }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send prompt node" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    renderPromptNode({ draftBusy: false, draftDisabled: true });

    expect((screen.getByRole("textbox", { name: "Draft prompt" }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send prompt node" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/AI requests are disabled/i)).toBeTruthy();
  });

  it("shows a canvas-safe draft error", () => {
    renderPromptNode({ draftError: "Canvas branching failed. Try again from the selected node." });

    expect(screen.getByRole("alert").textContent).toContain(
      "Canvas branching failed. Try again from the selected node.",
    );
  });
});
