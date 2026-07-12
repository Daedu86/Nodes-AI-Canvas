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
const isCi = process.env.CI === "1" || process.env.CI === "true";
const playwrightAuthSecret =
  process.env.AUTH_SECRET ??
  "ci-playwright-auth-key-7e2f4c8a9b1d6f3e5c7a2b4d8f0e1c3a";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: isCi
    ? [["list"], ["junit", { outputFile: "test-results/playwright-junit.xml" }]]
    : "list",
  // Next dev cold-start + route compilation can exceed 30s on GitHub runners.
  timeout: isCi ? 60_000 : 30_000,
  // The app uses a single shared webServer per run; multi-worker E2E can fight over shared cleanup.
  // Force determinism in CI until per-worker isolation is implemented.
  ...(isCi ? { workers: 1 } : {}),
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
      AUTH_SECRET: playwrightAuthSecret,
      ALLOW_E2E_AUTH_OVERRIDE: "1",
      E2E_MOCK_LLM: "1",
      E2E_AUTH_USER_EMAIL: "e2e@nodes.local",
      E2E_AUTH_USER_ID: "e2e-user",
      E2E_AUTH_USER_NAME: "E2E User",
      NODES_PERSISTENCE_BACKEND: "file",
      NODES_PLAN_FREE_CHAT_LIMIT_PER_MINUTE:
        process.env.NODES_PLAN_FREE_CHAT_LIMIT_PER_MINUTE ?? "60",
      NODES_PLAN_FREE_CHAT_LIMIT_PER_HOUR:
        process.env.NODES_PLAN_FREE_CHAT_LIMIT_PER_HOUR ?? "240",
      NODES_PLAN_FREE_CHAT_LIMIT_PER_DAY:
        process.env.NODES_PLAN_FREE_CHAT_LIMIT_PER_DAY ?? "1440",
      // Ensure deterministic default model selection in CI runs.
      DEFAULT_MODEL: "nvidia/nemotron-3-super-120b-a12b:free",
      NEXT_PUBLIC_DEFAULT_MODEL: "nvidia/nemotron-3-super-120b-a12b:free",
      NEXT_PUBLIC_DEFAULT_PROVIDER: "openrouter",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? playwrightAuthSecret,
      NEXTAUTH_URL: baseURL,
      PORT: String(port),
      PROJECT_STORE_DIR: projectStoreDir,
      SESSION_STORE_DIR: sessionStoreDir,
    },
  },
});
