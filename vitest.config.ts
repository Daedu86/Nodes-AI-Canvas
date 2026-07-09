import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
    include: ["tests/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/**", "components/**", "lib/**"],
      exclude: [
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
        "tests/**",
        "app/**/layout.*",
        "app/**/page.*",
        "app/**/loading.*",
        "app/**/not-found.*",
      ],
      // Minimal guardrails: raise as the suite grows.
      thresholds: {
        lines: 30,
        functions: 25,
        branches: 20,
        statements: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
