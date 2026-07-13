import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    files: ["tests/e2e/smoke.spec.ts"],
    rules: {
      // The smoke suite intentionally retains intermediate snapshots for
      // failure diagnosis while scenarios evolve. Production code remains strict.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
    },
  },
]);
