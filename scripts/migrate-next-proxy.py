from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIDDLEWARE_PATH = ROOT / "middleware.ts"
PROXY_PATH = ROOT / "proxy.ts"
TEST_PATH = ROOT / "tests/proxy.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


if not MIDDLEWARE_PATH.exists():
    fail("middleware.ts was not found.")
if PROXY_PATH.exists():
    fail("proxy.ts already exists.")
if TEST_PATH.exists():
    fail("tests/proxy.test.ts already exists.")

source = MIDDLEWARE_PATH.read_text(encoding="utf-8")
old_export = "export function middleware(request: NextRequest) {"
new_export = "export function proxy(request: NextRequest) {"
if source.count(old_export) != 1:
    fail("Expected exactly one middleware function export.")

PROXY_PATH.write_text(source.replace(old_export, new_export, 1), encoding="utf-8")
MIDDLEWARE_PATH.unlink()

TEST_PATH.write_text(
    '''import { describe, expect, it } from "vitest";\nimport { NextRequest } from "next/server";\nimport { config, proxy } from "@/proxy";\n\ndescribe("proxy", () => {\n  it("matches document routes while excluding APIs and framework assets", () => {\n    const matcher = new RegExp(`^${config.matcher[0]}$`, "u");\n    expect(matcher.test("/")).toBe(true);\n    expect(matcher.test("/projects/example")).toBe(true);\n    expect(matcher.test("/api/sessions")).toBe(false);\n    expect(matcher.test("/_next/static/chunks/app.js")).toBe(false);\n    expect(matcher.test("/favicon.ico")).toBe(false);\n  });\n\n  it("adds a nonce-backed CSP to the request and response", () => {\n    const response = proxy(new NextRequest("https://nodes.example/projects/example"));\n    const contentSecurityPolicy = response.headers.get("Content-Security-Policy");\n    const nonce = response.headers.get("x-middleware-request-x-nonce");\n\n    expect(contentSecurityPolicy).toBeTruthy();\n    expect(nonce).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);\n    expect(contentSecurityPolicy).toContain(`'nonce-${nonce}'`);\n    expect(\n      response.headers.get("x-middleware-request-content-security-policy"),\n    ).toBe(contentSecurityPolicy);\n  });\n});\n''',
    encoding="utf-8",
)

print("Next.js proxy migration prepared successfully.")
