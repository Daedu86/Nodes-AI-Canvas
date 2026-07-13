import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const playwrightStateDir = path.join(os.tmpdir(), "ai-canvas-playwright");
const playwrightRunId = (process.env.PLAYWRIGHT_RUN_ID ?? String(process.pid)).replace(
  /[^a-zA-Z0-9_-]/gu,
  "-",
);
const playwrightRunDir = path.join(playwrightStateDir, `run-${playwrightRunId}`);
const storeDir = (name: string) => path.join(playwrightRunDir, name);
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
  // Each CI shard owns a dedicated runner, web server, and state directory.
  // Keep one worker inside each shard so files remain deterministic while the
  // workflow provides parallelism without sharing server-side cleanup state.
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
      AGENT_WORK_STORE_DIR: storeDir("agent-work"),
      CHAT_USAGE_STORE_DIR: storeDir("chat-usage"),
      LLM_SETTINGS_STORE_DIR: storeDir("llm-settings"),
      PROJECT_INVITATION_STORE_DIR: storeDir("project-invitations"),
      PROJECT_MEMORY_STORE_DIR: storeDir("memory"),
      PROJECT_STORE_DIR: storeDir("projects"),
      SESSION_BLOB_STORE_DIR: storeDir("session-blobs"),
      SESSION_STORE_DIR: storeDir("sessions"),
      USER_PLAN_STORE_DIR: storeDir("user-plans"),
    },
  },
});