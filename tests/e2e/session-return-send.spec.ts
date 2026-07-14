import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;

type ReplyOptions = {
  history?: "last" | "full";
  provider?: string;
  model?: string;
  count?: number;
};

function expectedReply(
  prompt: string,
  {
    history = "last",
    provider = "openrouter",
    model = "openrouter/free",
    count = 1,
  }: ReplyOptions = {},
) {
  return `E2E reply: ${prompt} [provider=${provider} model=${model} history=${history} count=${count}]`;
}

function threadMessage(page: Page, text: string) {
  return page.locator("[data-message-id]").filter({ hasText: text }).first();
}

async function fetchAppJson<T>(page: Page, input: string, init?: RequestInit) {
  const url = new URL(input, page.url()).toString();
  const { body, headers, ...rest } = init ?? {};
  const normalizedHeaders = headers
    ? Object.fromEntries(new Headers(headers).entries())
    : {};
  const response = await page.request.fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...normalizedHeaders,
    },
    ...(body === undefined ? {} : { data: body }),
  });
  if (!response.ok()) {
    throw new Error(`Request failed for ${input}: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function resetAppData(page: Page) {
  const cleanupTargets = ["/api/projects", "/api/sessions", "/api/memory"];
  for (const target of cleanupTargets) {
    const url = new URL(target, PLAYWRIGHT_BASE_URL).toString();
    await page.request.fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ all: true }),
    });
  }

  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function ensureSignedIn(page: Page) {
  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder("Write a message...");
  if (await composer.isVisible().catch(() => false)) {
    return;
  }

  // In some app states we are already authenticated but need to create/open a session first.
  const newSessionButton = page.getByRole("button", { name: "New Session" });
  if (await newSessionButton.isVisible().catch(() => false)) {
    const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
    await expect(composer).toBeVisible({ timeout: 15_000 });
    return;
  }

  const loginButton = page.getByRole("button", { name: "Sign in with local dev credentials" });
  await expect(loginButton).toBeVisible({ timeout: 15_000 });
  await page.locator("#dev-email").fill(DEV_AUTH_EMAIL);
  await page.locator("#dev-password").fill(DEV_AUTH_PASSWORD);
  await loginButton.click();
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await dismissWorkspaceGuide(page);
}

async function createAndOpenNamedSession(page: Page, title: string) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
  await dismissWorkspaceGuide(page);
  return created.session.id;
}

async function dismissWorkspaceGuide(page: Page) {
  const guide = page.getByRole("dialog", {
    name: "Turn a question into a structured decision",
  });
  if (!(await guide.isVisible().catch(() => false))) return;

  await guide.getByRole("button", { name: "Close workspace guide" }).click();
  await expect(guide).toBeHidden();
}

async function sendPrompt(page: Page, prompt: string) {
  await dismissWorkspaceGuide(page);
  const composer = page.getByPlaceholder("Write a message...");
  await composer.fill(prompt);
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("/api/chat") &&
      (request.postData() ?? "").includes(prompt),
    { timeout: 15_000 },
  );
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/chat") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes(prompt),
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Send" }).click();
  await requestPromise;
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Chat request failed with ${response.status()}: ${await response.text()}`);
  }
  await expect(threadMessage(page, prompt)).toBeVisible({ timeout: 15_000 });
  await expect(threadMessage(page, expectedReply(prompt))).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await resetAppData(page);
});

test("composer still works after leaving the session surface and returning", async ({ page }) => {
  const title = `Return test ${Date.now()}`;
  await createAndOpenNamedSession(page, title);

  await sendPrompt(page, "hello one");

  // Leave the session surface through a current profile workspace.
  await page.getByRole("button", { name: "LLM Models" }).click();
  await expect(page.getByRole("heading", { name: "LLM Models" })).toBeVisible({
    timeout: 15_000,
  });

  // Return to the session via the left list.
  await page.getByRole("button", { name: new RegExp(title, "i") }).click();
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });

  await sendPrompt(page, "hello two");
});

test("composer still works after reopening the app with the stored active session", async ({ page }) => {
  const title = `Reopen test ${Date.now()}`;
  await createAndOpenNamedSession(page, title);
  await sendPrompt(page, "first message");

  // Simulate closing the app and reopening without a sessionId in the URL.
  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });

  // Prior message should still exist once the persisted snapshot is hydrated.
  await expect(threadMessage(page, "first message")).toBeVisible({ timeout: 15_000 });

  await sendPrompt(page, "second message");
});
