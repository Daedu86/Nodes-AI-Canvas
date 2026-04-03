import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const playwrightStateDir = path.join(os.tmpdir(), "ai-canvas-playwright");
const sessionStoreDir = path.join(
  playwrightStateDir,
  `playwright-session-store-${process.pid}`,
);
const projectStoreDir = path.join(
  playwrightStateDir,
  `playwright-project-store-${process.pid}`,
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL,
    browserName: "chromium",
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: true,
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname localhost --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    // Always start an isolated test server so E2E runs keep their own
    // mock LLM and on-disk stores instead of accidentally reusing a local dev app.
    reuseExistingServer: false,
    env: {
      ...process.env,
      AUTH_ENABLE_DEV_CREDENTIALS: "1",
      AUTH_DEV_EMAIL: process.env.AUTH_DEV_EMAIL ?? "demo@nodes.local",
      AUTH_DEV_NAME: process.env.AUTH_DEV_NAME ?? "Local Developer",
      AUTH_DEV_PASSWORD: process.env.AUTH_DEV_PASSWORD ?? "dev-password",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "playwright-auth-secret",
      E2E_MOCK_LLM: "1",
      E2E_AUTH_USER_EMAIL: "e2e@nodes.local",
      E2E_AUTH_USER_ID: "e2e-user",
      E2E_AUTH_USER_NAME: "E2E User",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "playwright-auth-secret",
      NEXTAUTH_URL: baseURL,
      PORT: String(port),
      PROJECT_STORE_DIR: projectStoreDir,
      SESSION_STORE_DIR: sessionStoreDir,
    },
  },
});
