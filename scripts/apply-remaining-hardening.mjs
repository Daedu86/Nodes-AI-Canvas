import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content.endsWith("\n") ? content : `${content}\n`);

console.log("[hardening] updating package scripts");
const packagePath = "package.json";
const packageJson = JSON.parse(await read(packagePath));
packageJson.scripts["typecheck:e2e"] = "tsc --noEmit -p tsconfig.e2e.json";
packageJson.scripts.check =
  "npm run format:check && npm run typecheck && npm run typecheck:e2e && npm run test:coverage && npm run test:critical-coverage";
await write(packagePath, JSON.stringify(packageJson, null, 2));

console.log("[hardening] creating E2E TypeScript configuration");
await write(
  "tsconfig.e2e.json",
  JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: {
        incremental: false,
        plugins: [],
        types: ["node", "@playwright/test"],
      },
      include: ["playwright.config.ts", "tests/e2e/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  ),
);

console.log("[hardening] adding E2E typecheck to CI");
const ciPath = ".github/workflows/ci.yml";
let ci = await read(ciPath);
const ciMarker = "      - name: Type check\n        run: npm run typecheck\n";
const ciReplacement =
  "      - name: Application type check\n" +
  "        run: npm run typecheck\n" +
  "      - name: End-to-end type check\n" +
  "        run: npm run typecheck:e2e\n";
if (ci.includes(ciMarker)) {
  ci = ci.replace(ciMarker, ciReplacement);
} else if (!ci.includes("run: npm run typecheck:e2e")) {
  throw new Error("CI type-check marker not found");
}
await write(ciPath, ci);

console.log("[hardening] normalizing E2E request headers");
const helperPattern = /(\s*)const \{ body, \.\.\.rest \} = init \?\? \{\};\n\1const response = await page\.request\.fetch\(url, \{\n\1  headers: \{\n\1    "Content-Type": "application\/json",\n\1    \.\.\.\(rest\.headers \?\? \{\}\),\n\1  \},\n\1  \.\.\.rest,\n/g;
let helperReplacements = 0;
for await (const testPath of glob("tests/e2e/**/*.ts")) {
  const source = await read(testPath);
  const patched = source.replace(helperPattern, (_, indent) => {
    helperReplacements += 1;
    return (
      `${indent}const { body, headers, ...rest } = init ?? {};\n` +
      `${indent}const normalizedHeaders = headers\n` +
      `${indent}  ? Object.fromEntries(new Headers(headers).entries())\n` +
      `${indent}  : {};\n` +
      `${indent}const response = await page.request.fetch(url, {\n` +
      `${indent}  ...rest,\n` +
      `${indent}  headers: {\n` +
      `${indent}    "Content-Type": "application/json",\n` +
      `${indent}    ...normalizedHeaders,\n` +
      `${indent}  },\n`
    );
  });
  if (patched !== source) await write(testPath, patched);
}
console.log(`[hardening] normalized ${helperReplacements} E2E request helper(s)`);
if (helperReplacements === 0) {
  throw new Error("No E2E request helper required normalization");
}

console.log("[hardening] securing artifact revision IDs and table escaping");
const artifactsPath = "lib/session-artifacts.ts";
let artifacts = await read(artifactsPath);
const oldRevisionId = `const makeRevisionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : \`revision-\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\`;`;
const newRevisionId = `const makeRevisionId = () => {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Secure random UUID generation is unavailable.");
  }
  return crypto.randomUUID();
};`;
if (artifacts.includes(oldRevisionId)) {
  artifacts = artifacts.replace(oldRevisionId, newRevisionId);
} else if (!artifacts.includes("Secure random UUID generation is unavailable.")) {
  throw new Error("Revision ID marker not found");
}

const oldTableStart = `const markdownTableFromRows = (rows: Array<Record<string, unknown>>) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) return null;
  const escape = (value: unknown) =>
    String(value ?? "")
      .replace(/\\\\/g, "\\\\\\\\")
      .replace(/\\|/g, "\\\\|")
      .replace(/\\s+/g, " ")
      .trim();`;
const newTableStart = `const escapeMarkdownTableCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\\\\/g, "\\\\\\\\")
    .replace(/\\|/g, "\\\\|")
    .replace(/\\s+/g, " ")
    .trim();

const markdownTableFromRows = (rows: Array<Record<string, unknown>>) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) return null;`;
if (artifacts.includes(oldTableStart)) {
  artifacts = artifacts.replace(oldTableStart, newTableStart);
  artifacts = artifacts.replaceAll("columns.map(escape)", "columns.map(escapeMarkdownTableCell)");
  artifacts = artifacts.replaceAll(
    "escape(row[column])",
    "escapeMarkdownTableCell(row[column])",
  );
} else if (!artifacts.includes("const escapeMarkdownTableCell")) {
  throw new Error("Markdown escape marker not found");
}

const oldDelimitedOutput = `  return [
    \`| \${header.join(" | ")} |\`,
    \`| \${header.map(() => "---").join(" | ")} |\`,
    ...body.map((row) => \`| \${row.join(" | ")} |\`),
  ].join("\\n");`;
const newDelimitedOutput = `  return [
    \`| \${header.map(escapeMarkdownTableCell).join(" | ")} |\`,
    \`| \${header.map(() => "---").join(" | ")} |\`,
    ...body.map(
      (row) => \`| \${row.map(escapeMarkdownTableCell).join(" | ")} |\`,
    ),
  ].join("\\n");`;
if (artifacts.includes(oldDelimitedOutput)) {
  artifacts = artifacts.replace(oldDelimitedOutput, newDelimitedOutput);
} else if (!artifacts.includes("row.map(escapeMarkdownTableCell)")) {
  throw new Error("Delimited table output marker not found");
}
await write(artifactsPath, artifacts);

console.log("[hardening] adding regression coverage");
await write(
  "tests/session-artifacts-hardening.test.ts",
  `import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendArtifactRevision,
  parseArtifactOutput,
  type SessionArtifact,
} from "@/lib/session-artifacts";

const artifact: SessionArtifact = {
  id: "artifact-1",
  title: "Draft",
  artifactType: "text",
  semanticType: "draft",
  content: "before",
  revisions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session artifact hardening", () => {
  it("uses secure UUID generation for revision identifiers", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
    });

    const updated = appendArtifactRevision(artifact, {
      content: "after",
      origin: "manual",
      author: "user",
    });

    expect(updated.revisions?.[0]?.id).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
  });

  it("fails closed when secure UUID generation is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() =>
      appendArtifactRevision(artifact, {
        content: "after",
        origin: "manual",
        author: "user",
      }),
    ).toThrow("Secure random UUID generation is unavailable.");
  });

  it("escapes Markdown-sensitive cells in delimited tables", () => {
    expect(parseArtifactOutput("table", "name,note\\nalpha,a|b\\nbeta,c\\\\d")).toBe(
      "| name | note |\\n| --- | --- |\\n| alpha | a\\\\|b |\\n| beta | c\\\\\\\\d |",
    );
  });
});
`,
);

console.log("[hardening] transformation complete");
