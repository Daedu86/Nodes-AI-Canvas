import { mkdir, readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content.endsWith("\n") ? content : `${content}\n`);

const packagePath = "package.json";
const packageJson = JSON.parse(await read(packagePath));
packageJson.scripts["typecheck:e2e"] = "tsc --noEmit -p tsconfig.e2e.json";
packageJson.scripts.check =
  "npm run format:check && npm run typecheck && npm run typecheck:e2e && npm run test:coverage && npm run test:critical-coverage";
await write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

await write(
  "tsconfig.e2e.json",
  JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: {
        incremental: false,
        plugins: [],
        types: ["node", "@playwright/test"],
      },
      include: ["playwright.config.ts", "tests/e2e/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  ),
);

await mkdir("tests/e2e/fixtures", { recursive: true });
await write(
  "tests/e2e/fixtures/app.ts",
  `import { expect, type Page } from "@playwright/test";

export type { Page } from "@playwright/test";

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";

export const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  \`http://localhost:\${process.env.PLAYWRIGHT_PORT ?? "3100"}\`;

export async function fetchAppJson<T>(page: Page, input: string, init?: RequestInit) {
  const currentUrl = page.url();
  const baseUrl = currentUrl.startsWith("http") ? currentUrl : PLAYWRIGHT_BASE_URL;
  const url = new URL(input, baseUrl).toString();
  const { body, ...rest } = init ?? {};
  const response = await page.request.fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    ...rest,
    ...(body === undefined ? {} : { data: body }),
  });
  if (!response.ok()) {
    throw new Error(\`Request failed for \${input}: \${response.status()}\`);
  }
  return (await response.json()) as T;
}

type ResetAppDataOptions = {
  cleanupTargets?: string[];
  maxAttempts?: number;
};

export async function resetAppData(
  page: Page,
  {
    cleanupTargets = ["/api/projects", "/api/sessions", "/api/memory"],
    maxAttempts = 5,
  }: ResetAppDataOptions = {},
) {
  for (const target of cleanupTargets) {
    const url = new URL(target, PLAYWRIGHT_BASE_URL).toString();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await page.request.fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({ all: true }),
        });
        if (!response.ok() && response.status() !== 400 && response.status() !== 404) {
          throw new Error(\`Cleanup failed for \${target}: \${response.status()}\`);
        }
        break;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await page.waitForTimeout(250 * attempt);
      }
    }
  }

  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function ensureSignedIn(page: Page) {
  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder("Write a message...");
  if (await composer.isVisible().catch(() => false)) return;

  const newSessionButton = page.getByRole("button", { name: "New Session" });
  if (await newSessionButton.isVisible().catch(() => false)) {
    const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await page.goto(\`/?sessionId=\${created.session.id}\`, { waitUntil: "domcontentloaded" });
    await expect(composer).toBeVisible({ timeout: 15_000 });
    return;
  }

  const loginButton = page.getByRole("button", {
    name: "Sign in with local dev credentials",
  });
  await expect(loginButton).toBeVisible({ timeout: 15_000 });
  const emailInput = page.locator("#dev-email");
  const passwordInput = page.locator("#dev-password");
  await emailInput.fill(DEV_AUTH_EMAIL);
  await passwordInput.fill(DEV_AUTH_PASSWORD);
  await expect(emailInput).toHaveValue(DEV_AUTH_EMAIL);
  await expect(passwordInput).toHaveValue(DEV_AUTH_PASSWORD);
  await loginButton.click();
  await expect(composer).toBeVisible({ timeout: 15_000 });
}

export async function createAndOpenSession(
  page: Page,
  options?: { title?: string },
) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify(options?.title ? { title: options.title } : {}),
  });
  await page.goto(\`/?sessionId=\${created.session.id}\`, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
  return created.session.id;
}
`,
);

const getStatementName = (statement) => {
  if (ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
    return statement.name?.text ?? null;
  }
  if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    const declaration = statement.declarationList.declarations[0];
    return ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  }
  return null;
};

const transforms = [
  {
    path: "tests/e2e/accessibility.spec.ts",
    remove: new Set([
      "Page",
      "DEV_AUTH_EMAIL",
      "DEV_AUTH_PASSWORD",
      "PLAYWRIGHT_BASE_URL",
      "fetchAppJson",
      "resetAppData",
      "ensureSignedIn",
      "createAndOpenSession",
    ]),
    importText:
      'import { createAndOpenSession as createAndOpenTestSession, resetAppData } from "./fixtures/app";',
    replace: [
      [
        "await createAndOpenSession(page);",
        'await createAndOpenTestSession(page, { title: "Accessibility verification" });',
      ],
    ],
  },
  {
    path: "tests/e2e/chat-image-attachment.spec.ts",
    remove: new Set([
      "Page",
      "DEV_AUTH_EMAIL",
      "DEV_AUTH_PASSWORD",
      "PLAYWRIGHT_BASE_URL",
      "fetchAppJson",
      "resetAppData",
      "ensureSignedIn",
      "createAndOpenSession",
    ]),
    importText:
      'import { createAndOpenSession as createAndOpenTestSession, resetAppData } from "./fixtures/app";',
    replace: [["await createAndOpenSession(page);", "await createAndOpenTestSession(page);"]],
  },
  {
    path: "tests/e2e/smoke.spec.ts",
    remove: new Set([
      "Page",
      "DEV_AUTH_EMAIL",
      "DEV_AUTH_PASSWORD",
      "PLAYWRIGHT_BASE_URL",
      "fetchAppJson",
      "resetAppData",
      "ensureSignedIn",
    ]),
    importText:
      'import { ensureSignedIn, fetchAppJson, resetAppData, type Page } from "./fixtures/app";',
    replace: [],
  },
  {
    path: "tests/e2e/session-return-send.spec.ts",
    remove: new Set([
      "Page",
      "DEV_AUTH_EMAIL",
      "DEV_AUTH_PASSWORD",
      "PLAYWRIGHT_BASE_URL",
      "fetchAppJson",
      "resetAppData",
      "ensureSignedIn",
    ]),
    importText:
      'import { ensureSignedIn, fetchAppJson, resetAppData, type Page } from "./fixtures/app";',
    replace: [],
  },
];

for (const transform of transforms) {
  let source = await read(transform.path);
  const sourceFile = ts.createSourceFile(
    transform.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const ranges = sourceFile.statements
    .filter((statement) => transform.remove.has(getStatementName(statement)))
    .map((statement) => [statement.getFullStart(), statement.end])
    .sort((a, b) => b[0] - a[0]);
  for (const [start, end] of ranges) {
    source = `${source.slice(0, start)}${source.slice(end)}`;
  }

  const reparsed = ts.createSourceFile(
    transform.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = reparsed.statements.filter(ts.isImportDeclaration);
  const insertAt = imports.at(-1)?.end ?? 0;
  source = `${source.slice(0, insertAt)}\n${transform.importText}${source.slice(insertAt)}`;
  for (const [before, after] of transform.replace) {
    if (!source.includes(before)) {
      throw new Error(`Expected replacement marker not found in ${transform.path}: ${before}`);
    }
    source = source.replace(before, after);
  }
  await write(transform.path, source);
}

await write(
  "tests/persisted-resource-client-critical.test.ts",
  `import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSerialTaskQueue,
  fetchApi,
  getClientHttpErrorMessage,
  readStoredResourceId,
  writeStoredResourceId,
} from "@/lib/client/persisted-resource-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
};

describe("persisted resource client critical paths", () => {
  it("prefers URL state and persists user-scoped resource ids", () => {
    const localStorage = createStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { location: { search: "?sessionId=url-session" } });

    expect(readStoredResourceId("session", "user-1", { urlParam: "sessionId" })).toBe(
      "url-session",
    );

    vi.stubGlobal("window", { location: { search: "" } });
    writeStoredResourceId("session", "user-1", "stored-session");
    expect(readStoredResourceId("session", "user-1")).toBe("stored-session");
    writeStoredResourceId("session", "user-1", null);
    expect(localStorage.removeItem).toHaveBeenCalledWith("nodes.active-session-id.user-1");
  });

  it("preserves HTTP status and payload while allowing expected statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid request" }), {
          headers: { "Content-Type": "application/json" },
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/api/failure")).rejects.toMatchObject({
      payload: { error: "Invalid request" },
      status: 400,
    });
    await expect(
      fetchApi("/api/missing", undefined, { allowedStatuses: [404] }),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("extracts payload messages and keeps the serial queue moving after rejection", async () => {
    expect(
      getClientHttpErrorMessage(
        Object.assign(new Error("fallback"), {
          payload: { message: "Server message" },
          status: 409,
        }),
        "Request failed",
      ),
    ).toBe("Server message");

    const enqueue = createSerialTaskQueue("fallback");
    const order: string[] = [];
    await expect(
      enqueue(async () => {
        order.push("first");
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    await expect(
      enqueue(async () => {
        order.push("second");
        return "done";
      }),
    ).resolves.toBe("done");
    expect(order).toEqual(["first", "second"]);
  });
});
`,
);

await write(
  "tests/session-persistence-critical.test.ts",
  `import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionDocument, SessionThreadExport } from "@/lib/session-documents";
import { SESSION_VERSION_CONFLICT_CODE } from "@/lib/session-version-conflict";
import {
  clearSessionSnapshotCache,
  patchSessionRequest,
  readRecoverableSessionSnapshot,
  readSessionConflictResponse,
  recoverSessionDocumentFromCache,
} from "@/lib/client/session-persistence";

const snapshot = (messageCount: number): SessionThreadExport => ({
  headId: messageCount > 0 ? \`message-\${messageCount}\` : null,
  messages: Array.from({ length: messageCount }, (_, index) => ({
    message: { id: \`message-\${index + 1}\` },
    parentId: index === 0 ? null : \`message-\${index}\`,
  })),
});

const sessionDocument = (messageCount = 1, version = 1): SessionDocument => ({
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "session-1",
  messageCount,
  snapshot: snapshot(messageCount),
  title: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  version,
});

const createStorage = (raw: string | null) => ({
  getItem: vi.fn(() => raw),
  removeItem: vi.fn(),
  setItem: vi.fn(),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session persistence critical paths", () => {
  it("validates typed conflict payloads", () => {
    const payload = {
      code: SESSION_VERSION_CONFLICT_CODE,
      error: "Conflict",
      expectedVersion: 2,
      session: { id: "session-1" },
    };
    const error = Object.assign(new Error("Conflict"), { payload, status: 409 });
    expect(readSessionConflictResponse(error)).toEqual(payload);
    expect(
      readSessionConflictResponse(Object.assign(new Error("No conflict"), { status: 400 })),
    ).toBeNull();
    expect(
      readSessionConflictResponse(
        Object.assign(new Error("Malformed"), { payload: { code: "wrong" }, status: 409 }),
      ),
    ).toBeNull();
  });

  it("reads and clears recoverable local snapshots", () => {
    const localStorage = createStorage(JSON.stringify({ snapshot: snapshot(3) }));
    vi.stubGlobal("localStorage", localStorage);

    expect(readRecoverableSessionSnapshot("session-1", snapshot(1))).toEqual(snapshot(3));
    clearSessionSnapshotCache("session-1");
    expect(localStorage.removeItem).toHaveBeenCalledWith(
      "nodes.session-snapshot-cache.v1:session-1",
    );
  });

  it("sends versioned session patches through the shared client", async () => {
    const remote = sessionDocument(2, 2);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session: remote }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      patchSessionRequest("session/1", { title: "Updated" }, 1, { keepalive: true }),
    ).resolves.toEqual({ session: remote });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session/1",
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 1, title: "Updated" }),
        keepalive: true,
        method: "PATCH",
      }),
    );
  });

  it("recovers a newer cached snapshot and registers conflicts on failure", async () => {
    const current = sessionDocument(1, 1);
    const cached = snapshot(3);
    vi.stubGlobal("localStorage", createStorage(JSON.stringify({ snapshot: cached })));
    const remote = { ...current, messageCount: 3, snapshot: cached, version: 2 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: remote }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Conflict" }), {
          headers: { "Content-Type": "application/json" },
          status: 409,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const registerConflict = vi.fn(() => true);

    await expect(recoverSessionDocumentFromCache(current, registerConflict)).resolves.toEqual(
      remote,
    );
    await expect(recoverSessionDocumentFromCache(current, registerConflict)).resolves.toEqual({
      ...current,
      snapshot: cached,
    });
    expect(registerConflict).toHaveBeenCalledWith(
      "session-1",
      { snapshot: cached },
      expect.objectContaining({ status: 409 }),
    );
  });
});
`,
);

await write(
  "vitest.critical.config.ts",
  `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/api-route-helpers.test.ts",
      "tests/artifact-upload-policy.test.ts",
      "tests/canvas-flow-indexes.test.ts",
      "tests/chat-stream-metrics.test.ts",
      "tests/environment.test.ts",
      "tests/llm-settings-client.test.ts",
      "tests/llm-settings-encryption.test.ts",
      "tests/llm-settings-model-options.test.ts",
      "tests/memory-client.test.ts",
      "tests/persisted-resource-client.test.ts",
      "tests/persisted-resource-client-critical.test.ts",
      "tests/persistence-repositories.test.ts",
      "tests/project-collaboration.test.ts",
      "tests/project-invitations.test.ts",
      "tests/provider-runtime.test.ts",
      "tests/session-orchestration.test.ts",
      "tests/session-persistence.test.ts",
      "tests/session-persistence-critical.test.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/critical",
      reporter: ["text", "json-summary", "html"],
      include: [
        "components/assistant-ui/thread-graph-flow/canvas-flow-indexes.ts",
        "components/context/llm-settings-model-options.ts",
        "lib/artifact-upload-policy.ts",
        "lib/client/llm-settings-client.ts",
        "lib/client/memory-client.ts",
        "lib/client/persisted-resource-client.ts",
        "lib/client/session-orchestration.ts",
        "lib/client/session-persistence.ts",
        "lib/llm/provider-runtime.ts",
        "lib/persistence/backend.ts",
        "lib/persistence/repositories.ts",
        "lib/project-collaboration.ts",
        "lib/project-invitation-service.ts",
        "lib/server/api-response.ts",
        "lib/server/chat/stream-metrics.ts",
        "lib/server/environment.ts",
        "lib/server/llm-settings-encryption.ts",
        "lib/server/project-invitation-http.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
    },
  },
});
`,
);
