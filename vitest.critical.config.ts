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
      "tests/artifact-upload-policy.test.ts",
      "tests/canvas-flow-indexes.test.ts",
      "tests/chat-stream-metrics.test.ts",
      "tests/environment.test.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/critical",
      reporter: ["text", "json-summary", "html"],
      include: [
        "components/assistant-ui/thread-graph-flow/canvas-flow-indexes.ts",
        "lib/artifact-upload-policy.ts",
        "lib/server/chat/stream-metrics.ts",
        "lib/server/environment.ts",
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
