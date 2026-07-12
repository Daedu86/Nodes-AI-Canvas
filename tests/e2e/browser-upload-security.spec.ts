import { expect, test } from "@playwright/test";

const TEST_HEADERS = {
  "x-test-user-email": "upload-security@nodes.local",
  "x-test-user-id": "upload-security-user",
  "x-test-user-name": "Upload Security User",
};

test("serves browser security headers with a nonce-bound CSP", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __cspViolations?: string[] };
    state.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      state.__cspViolations?.push(`${event.violatedDirective}:${event.blockedURI}`);
    });
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();

  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9_-]{16,128}'/u,
  );
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");

  await page.waitForTimeout(250);
  const violations = await page.evaluate(() => {
    const state = window as typeof window & { __cspViolations?: string[] };
    return state.__cspViolations ?? [];
  });
  expect(violations).toEqual([]);
});

test("rejects dangerous upload extensions and accepts one safe bounded file", async ({
  request,
}) => {
  const createResponse = await request.post("/api/sessions", {
    data: { title: "Upload security verification" },
    headers: TEST_HEADERS,
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { session: { id: string } };
  const sessionId = created.session.id;

  try {
    const dangerous = await request.post(`/api/sessions/${sessionId}/artifacts`, {
      headers: TEST_HEADERS,
      multipart: {
        file: {
          buffer: Buffer.from("<script>alert(1)</script>", "utf8"),
          mimeType: "text/plain",
          name: "payload.html",
        },
      },
    });
    expect(dangerous.status()).toBe(415);
    expect(await dangerous.text()).toContain("Unsupported artifact extension");

    const safe = await request.post(`/api/sessions/${sessionId}/artifacts`, {
      headers: TEST_HEADERS,
      multipart: {
        file: {
          buffer: Buffer.from("safe notes", "utf8"),
          mimeType: "text/plain",
          name: "notes.txt",
        },
      },
    });
    expect(safe.status()).toBe(200);
    expect(safe.headers()["cache-control"]).toBe("no-store");
    expect(safe.headers()["x-nodes-upload-remaining-requests-minute"]).toBeDefined();
    const safeBody = (await safe.json()) as Record<string, unknown>;
    expect(safeBody).toMatchObject({
      byteSize: 10,
      fileName: "notes.txt",
      mimeType: "text/plain",
    });
  } finally {
    const deleteResponse = await request.delete("/api/sessions", {
      data: { sessionIds: [sessionId] },
      headers: TEST_HEADERS,
    });
    expect(deleteResponse.status()).toBe(200);
  }
});
