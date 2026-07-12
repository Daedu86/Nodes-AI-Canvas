import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p2sQAAAAASUVORK5CYII=";

type Page = import("@playwright/test").Page;

type CapturedChatRequest = {
  url: string;
  postData?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;

async function fetchAppJson<T>(page: Page, input: string, init?: RequestInit) {
  const url = new URL(input, page.url()).toString();
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

  const loginButton = page.getByRole("button", {
    name: "Sign in with local dev credentials",
  });
  if (await loginButton.isVisible().catch(() => false)) {
    await page.locator("#dev-email").fill(DEV_AUTH_EMAIL);
    await page.locator("#dev-password").fill(DEV_AUTH_PASSWORD);
    await loginButton.click();
    await expect(composer).toBeVisible({ timeout: 15_000 });
  }
}

async function createAndOpenSession(page: Page) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(
    page,
    "/api/sessions",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  await page.goto(`/?sessionId=${created.session.id}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await resetAppData(page);
  await createAndOpenSession(page);
});

test("attaching an image includes it in the sent message", async ({ page }) => {
  const filePath = test.info().outputPath("pixel.png");
  await fs.writeFile(filePath, Buffer.from(PIXEL_PNG_BASE64, "base64"));

  const chatRequests: CapturedChatRequest[] = [];
  const chatRequestBodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (!req.url().includes("/api/chat")) return;
    try {
      chatRequests.push({ url: req.url(), postData: req.postDataJSON() });
    } catch {
      chatRequests.push({ url: req.url() });
    }
    try {
      chatRequestBodies.push(req.postData() ?? "");
    } catch {
      // ignore postData read errors
    }
  });

  // Switch to a vision-capable model so image parts are accepted.
  await page.getByRole("combobox", { name: "Model" }).selectOption({
    label: "OpenRouter · Nemotron Nano 12B V2 VL (free)",
  });

  // Attach image.
  await page.getByRole("button", { name: "Attach image" }).click();
  await page.getByTestId("chat-image-input").setInputFiles(filePath);

  // Preview shows before send.
  await expect(page.getByTestId("composer-image-preview")).toBeVisible();
  await expect(
    page
      .getByTestId("composer-image-preview")
      .getByRole("img", { name: "pixel.png" }),
  ).toBeVisible();

  // Send (no manual text) should auto-generate a prompt and include the image.
  const sendButton = page.getByRole("button", { name: "Send" });
  await expect(sendButton).toBeEnabled();

  const chatRequestPromise = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().includes("/api/chat") &&
      (req.postData() ?? "").includes("data:image/png;base64,"),
    { timeout: 10_000 },
  );

  await sendButton.click();

  // Preview should clear after send.
  await expect(page.getByTestId("composer-image-preview")).toHaveCount(0);

  await chatRequestPromise;

  // The user message bubble should render the attached image (not just the composer preview).
  await expect(page.locator('img[alt="pixel.png"]').first()).toBeVisible();

  // Assert the request included an image part.
  expect(chatRequests.length).toBeGreaterThan(0);
  const last = asRecord(chatRequests.at(-1)?.postData);
  const messages = Array.isArray(last?.messages) ? last.messages : [];
  const lastUser = [...messages]
    .reverse()
    .find((message) => asRecord(message)?.role === "user");
  const lastUserRecord = asRecord(lastUser);
  const parts = Array.isArray(lastUserRecord?.parts)
    ? lastUserRecord.parts
    : Array.isArray(lastUserRecord?.content)
      ? lastUserRecord.content
      : [];
  expect(Array.isArray(parts)).toBeTruthy();
  const hasImage = parts.some((part) => {
    const record = asRecord(part);
    if (!record) return false;
    if (record.type === "image" && typeof record.image === "string") {
      return true;
    }
    if (
      record.type === "file" &&
      typeof record.url === "string" &&
      typeof record.mediaType === "string" &&
      record.mediaType.startsWith("image/")
    ) {
      return true;
    }
    return false;
  });
  expect(hasImage).toBeTruthy();
});

test("send is blocked while an image is still preparing", async ({ page }) => {
  const filePath = test.info().outputPath("pixel.png");
  await fs.writeFile(filePath, Buffer.from(PIXEL_PNG_BASE64, "base64"));

  await page.goto("/");
  await page.getByRole("button", { name: "Attach image" }).click();
  await page.getByTestId("chat-image-input").setInputFiles(filePath);

  // Immediately try sending; if preparation is still in-flight, a user-facing error should appear.
  // (This guards the race where users click Send before FileReader resolves.)
  await page.getByRole("button", { name: "Send" }).click();
  const alert = page.getByTestId("composer-error");
  await expect(alert).toContainText(
    /preparing the image attachment|text-only|Could not send/i,
  );
});

test("attaching an image does not auto-send when text is already typed", async ({
  page,
}) => {
  const filePath = test.info().outputPath("pixel.png");
  await fs.writeFile(filePath, Buffer.from(PIXEL_PNG_BASE64, "base64"));

  const chatRequests: CapturedChatRequest[] = [];
  page.on("request", (req) => {
    if (req.method() !== "POST") return;
    if (!req.url().includes("/api/chat")) return;
    try {
      chatRequests.push({ url: req.url(), postData: req.postDataJSON() });
    } catch {
      chatRequests.push({ url: req.url() });
    }
  });

  // Switch to a vision-capable model so image parts are accepted.
  await page.getByRole("combobox", { name: "Model" }).selectOption({
    label: "OpenRouter · Nemotron Nano 12B V2 VL (free)",
  });

  const composer = page.getByPlaceholder("Write a message...");
  await composer.fill("Describe this image, please.");

  // Attach image should NOT submit the composer form automatically.
  await page.getByRole("button", { name: "Attach image" }).click();
  await page.getByTestId("chat-image-input").setInputFiles(filePath);

  await expect(page.getByTestId("composer-image-preview")).toBeVisible();
  await page.waitForTimeout(300);
  expect(chatRequests.length).toBe(0);

  const chatRequestPromise = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().includes("/api/chat") &&
      (req.postData() ?? "").includes("Describe this image, please.") &&
      (req.postData() ?? "").includes("data:image/png;base64,"),
    { timeout: 10_000 },
  );

  await page.getByRole("button", { name: "Send" }).click();
  await chatRequestPromise;
});
