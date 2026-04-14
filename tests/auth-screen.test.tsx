// @vitest-environment jsdom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthScreen } from "../components/auth/auth-screen";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("AuthScreen", () => {
  it("shows a visible OAuth callback error message", () => {
    render(
      <AuthScreen
        authError="OAuthCallback"
        agentTokenLoginEnabled={false}
        canonicalAppUrl="https://nodes-lemon.vercel.app"
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
});
