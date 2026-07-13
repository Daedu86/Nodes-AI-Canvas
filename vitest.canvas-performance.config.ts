import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  benchmark: {
    include: ["tests/benchmarks/canvas-flow-elements.bench.js"],
    outputJson: "test-results/canvas-benchmark.json",
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/benchmarks/canvas-flow-budget.performance.js"],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "."),
    },
  },
});
