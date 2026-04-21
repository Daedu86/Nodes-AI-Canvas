// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuthScreen } from "../components/auth/auth-screen";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("AuthScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a visible OAuth callback error message", () => {
    render(
      <AuthScreen
        authError="OAuthCallback"
        agentTokenLoginEnabled={false}
        canonicalAppUrl={window.location.origin}
        devCredentialsDefaultEmail="demo@nodes.local"
        devCredentialsEnabled={false}
        emailConfigured={false}
        googleConfigured={false}
        githubConfigured
      />,
    );

    expect(
      screen.getByText(/github sign-in failed during the oauth callback/i),
    ).not.toBeNull();
  });

  it("ignores malformed canonical URLs instead of crashing the sign-in screen", () => {
    expect(() =>
      render(
        <AuthScreen
          authError={null}
          agentTokenLoginEnabled={false}
          canonicalAppUrl="nodes-lemon.vercel.app"
          devCredentialsDefaultEmail="demo@nodes.local"
          devCredentialsEnabled={false}
          emailConfigured={false}
          googleConfigured={false}
          githubConfigured
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Access Nodes")).not.toBeNull();
  });
});
