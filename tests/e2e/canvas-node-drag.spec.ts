import { expect, test, type Locator, type Page } from "@playwright/test";

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;

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
    throw new Error(`Request failed for ${input}: ${response.status()}`);
  }
  return (await response.json()) as T;
}

async function resetAppData(page: Page) {
  for (const target of ["/api/projects", "/api/sessions", "/api/memory"]) {
    const response = await page.request.fetch(
      new URL(target, PLAYWRIGHT_BASE_URL).toString(),
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ all: true }),
      },
    );
    expect([200, 204, 400, 404]).toContain(response.status());
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
  if (await composer.isVisible().catch(() => false)) return;

  const newSessionButton = page.getByRole("button", { name: "New Session" });
  if (await newSessionButton.isVisible().catch(() => false)) return;

  const loginButton = page.getByRole("button", {
    name: "Sign in with local dev credentials",
  });
  await expect(loginButton).toBeVisible({ timeout: 15_000 });
  await page.locator("#dev-email").fill(DEV_AUTH_EMAIL);
  await page.locator("#dev-password").fill(DEV_AUTH_PASSWORD);
  await loginButton.click();
  await expect(newSessionButton).toBeVisible({ timeout: 15_000 });
}

async function createAndOpenSession(page: Page) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(
    page,
    "/api/sessions",
    {
      method: "POST",
      body: JSON.stringify({ title: "Canvas drag verification" }),
    },
  );
  await page.goto(`/?sessionId=${created.session.id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({
    timeout: 15_000,
  });
  return created.session.id;
}

async function dismissWorkspaceGuide(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Turn a question into a structured decision",
  });
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(dialog).toBeHidden();
  }
}

async function openCanvas(page: Page) {
  const splitButton = page.getByRole("button", {
    name: /^(Open|Exit) split workspace$/u,
  });
  await expect(splitButton).toBeVisible({ timeout: 15_000 });
  if ((await splitButton.getAttribute("aria-label")) === "Open split workspace") {
    await splitButton.click();
  }
  await expect(page.getByRole("region", { name: "Conversation canvas" })).toBeVisible({
    timeout: 15_000,
  });
}

async function readGraphPosition(node: Locator) {
  return node.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
}

test.beforeEach(async ({ page }) => {
  await resetAppData(page);
});

test("conversation nodes can be dragged and keep their position after reload", async ({
  page,
}) => {
  const sessionId = await createAndOpenSession(page);
  await dismissWorkspaceGuide(page);
  await openCanvas(page);

  const canvas = page.getByRole("region", { name: "Conversation canvas" });
  const node = canvas.locator(".react-flow__node-threadNode").first();
  await expect(node).toBeVisible({ timeout: 15_000 });

  const nodeId = await node.getAttribute("data-id");
  expect(nodeId).toBeTruthy();

  const before = await readGraphPosition(node);
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Conversation node has no bounding box");

  const startX = box.x + Math.min(80, box.width / 3);
  const startY = box.y + 22;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 180, startY + 110, { steps: 12 });
  await page.mouse.up();

  const after = await expect
    .poll(async () => readGraphPosition(node), { timeout: 10_000 })
    .toSatisfy(
      (position) =>
        Math.abs(position.x - before.x) > 50 &&
        Math.abs(position.y - before.y) > 30,
    );

  const moved = await readGraphPosition(node);
  const storageKey = `nodes.canvas-message-positions.v1:${sessionId}`;
  const storedPosition = await page.evaluate(
    ({ key, id }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
      return parsed[id] ?? null;
    },
    { key: storageKey, id: nodeId as string },
  );

  expect(storedPosition).not.toBeNull();
  expect(storedPosition?.x).toBeCloseTo(moved.x, 3);
  expect(storedPosition?.y).toBeCloseTo(moved.y, 3);

  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissWorkspaceGuide(page);
  await openCanvas(page);

  const reloadedNode = page
    .getByRole("region", { name: "Conversation canvas" })
    .locator(`.react-flow__node-threadNode[data-id="${nodeId}"]`);
  await expect(reloadedNode).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(async () => readGraphPosition(reloadedNode), { timeout: 10_000 })
    .toEqual({
      x: expect.closeTo(moved.x, 3),
      y: expect.closeTo(moved.y, 3),
    });
});
