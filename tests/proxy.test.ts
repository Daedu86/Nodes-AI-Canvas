import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

describe("proxy", () => {
  it("matches document routes while excluding APIs and framework assets", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`, "u");
    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/projects/example")).toBe(true);
    expect(matcher.test("/api/sessions")).toBe(false);
    expect(matcher.test("/_next/static/chunks/app.js")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);
  });

  it("adds a nonce-backed CSP to the request and response", () => {
    const response = proxy(new NextRequest("https://nodes.example/projects/example"));
    const contentSecurityPolicy = response.headers.get("Content-Security-Policy");
    const nonce = response.headers.get("x-middleware-request-x-nonce");

    expect(contentSecurityPolicy).toBeTruthy();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);
    expect(contentSecurityPolicy).toContain(`'nonce-${nonce}'`);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(contentSecurityPolicy);
  });
});
