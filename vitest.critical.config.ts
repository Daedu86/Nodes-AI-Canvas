import { dirname, resolve } from "node:path";
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
      "tests/persistence-repositories.test.ts",
      "tests/project-collaboration.test.ts",
      "tests/project-invitations.test.ts",
      "tests/provider-runtime.test.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/critical",
      reporter: ["text", "json-summary", "html"],
      include: [
        "components/assistant-ui/thread-graph-flow/canvas-flow-indexes.ts",
        "lib/artifact-upload-policy.ts",
        "lib/llm/provider-runtime.ts",
        "lib/persistence/backend.ts",
        "lib/persistence/repositories.ts",
        "lib/project-collaboration.ts",
        "lib/project-invitation-service.ts",
        "lib/server/api-response.ts",
        "lib/server/chat/stream-metrics.ts",
        "lib/server/environment.ts",
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
