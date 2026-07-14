import { readFile, writeFile } from "node:fs/promises";

const path = "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx";
const source = await readFile(path, "utf8");
const marker = "    showInspector,\n";
if (!source.includes(marker)) {
  throw new Error("Unused showInspector destructuring marker not found");
}
await writeFile(path, source.replace(marker, "", 1));
console.log("[hardening] removed unused showInspector destructuring");
