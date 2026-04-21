// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AppTitleSync } from "../components/app-title-sync";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => ({
    toString: () => "",
  }),
}));

describe("AppTitleSync", () => {
  beforeEach(() => {
    document.title = "New Tab";
  });

  afterEach(() => {
    cleanup();
  });

  it("forces the browser tab title to Nodes", () => {
    render(<AppTitleSync />);

    expect(document.title).toBe("Nodes");
  });
});
