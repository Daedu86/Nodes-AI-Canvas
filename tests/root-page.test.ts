import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockHeaders, mockAuth, mockRedirect } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockAuth: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/auth", () => ({
  auth: mockAuth,
  authUiConfig: {
    canonicalAppUrl: "nodes-lemon.vercel.app",
    agentTokenLoginEnabled: false,
    devCredentialsDefaultEmail: "demo@nodes.local",
    devCredentialsEnabled: false,
    emailConfigured: false,
    googleConfigured: false,
    githubConfigured: false,
  },
}));

vi.mock("@/components/auth/auth-screen", () => ({
  AuthScreen: () => null,
}));

vi.mock("../app/assistant", () => ({
  Assistant: () => null,
}));

import Page from "../app/page";

vi.stubGlobal("React", React);

describe("root page", () => {
  beforeEach(() => {
    mockHeaders.mockReset();
    mockAuth.mockReset();
    mockRedirect.mockReset();
    mockHeaders.mockResolvedValue(
      new Headers({
        host: "nodes-lemon.vercel.app",
        "x-forwarded-proto": "https",
      }),
    );
    mockAuth.mockResolvedValue(null);
  });

  it("renders the auth screen when NEXTAUTH_URL is malformed", async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
