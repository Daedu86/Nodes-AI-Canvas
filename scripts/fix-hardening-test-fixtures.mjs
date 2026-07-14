import { readFile, writeFile } from "node:fs/promises";

const path = "tests/canvas-flow-elements.test.ts";
let source = await readFile(path, "utf8");

const setterMarker = "    setDraftText: vi.fn(),\n";
if (!source.includes("    setDraftContextScope: vi.fn(),\n")) {
  if (!source.includes(setterMarker)) {
    throw new Error("setDraftText fixture marker not found");
  }
  source = source.replace(
    setterMarker,
    `${setterMarker}    setDraftContextScope: vi.fn(),\n`,
  );
}

const draftMarker = '        operation: "create-sibling-prompt",\n        text: "Alternative question",\n';
if (!source.includes('        contextScope: null,\n        text: "Alternative question",\n')) {
  if (!source.includes(draftMarker)) {
    throw new Error("GraphBranchIntent fixture marker not found");
  }
  source = source.replace(
    draftMarker,
    '        operation: "create-sibling-prompt",\n        contextScope: null,\n        text: "Alternative question",\n',
  );
}

await writeFile(path, source);
console.log("[hardening] updated canvas flow test fixtures");
