// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeCenterWorkspace } from "../components/workspace/knowledge-center-workspace";

const showWorkspaceMock = vi.fn();

vi.mock("../components/context/workspace-surface", () => ({
  useWorkspaceSurface: () => ({
    showWorkspace: showWorkspaceMock,
  }),
}));

vi.mock("../components/workspace/product-brand", () => ({
  ProductBrand: () => <div>Nodes</div>,
}));

describe("KnowledgeCenterWorkspace", () => {
  beforeEach(() => {
    showWorkspaceMock.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("surfaces Agent Access docs and section matches from search", async () => {
    const user = userEvent.setup();
    render(<KnowledgeCenterWorkspace />);

    await user.type(screen.getByRole("textbox", { name: "Search knowledge center" }), "Agent Access");

    expect(screen.getByRole("button", { name: /Agent Access/i })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Token Setup" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Endpoint Usage" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Examples" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Troubleshooting" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Examples" }));

    expect(screen.getByRole("heading", { name: "Agent Access" })).not.toBeNull();
    expect(screen.getByText(/POST http:\/\/localhost:3000\/api\/agents\/chat/i)).not.toBeNull();
  });
});
