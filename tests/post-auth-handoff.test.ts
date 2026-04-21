// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPostAuthCallbackUrl,
  clearPostAuthHandoff,
  hasPostAuthChatHandoff,
} from "../lib/client/post-auth-handoff";

describe("post-auth handoff helpers", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("builds callback URLs against a canonical origin override", () => {
    expect(buildPostAuthCallbackUrl("/", "https://nodes-lemon.vercel.app")).toBe(
      "https://nodes-lemon.vercel.app/?handoff=chat",
    );
  });

  it("falls back to the current origin when the canonical override is malformed", () => {
    expect(buildPostAuthCallbackUrl("/", "nodes-lemon.vercel.app")).toBe(
      `${window.location.origin}/?handoff=chat`,
    );
  });

  it("detects and clears the chat handoff query param", () => {
    window.history.replaceState({}, "", "/?handoff=chat");

    expect(hasPostAuthChatHandoff()).toBe(true);

    clearPostAuthHandoff();

    expect(hasPostAuthChatHandoff()).toBe(false);
    expect(window.location.search).toBe("");
  });
});
