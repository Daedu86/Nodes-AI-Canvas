import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const files = [
  "components/workspace/use-project-workspace-controller.ts",
  "components/workspace/project-workspace-view.tsx",
  "components/context/llm-settings.tsx",
  "components/context/use-llm-settings-persistence.ts",
  "components/context/use-llm-settings-actions.ts",
  "components/context/llm-settings-model-options.ts",
];

const printer = ts.createPrinter({
  newLine: ts.NewLineKind.LineFeed,
  removeComments: false,
});

for (const path of files) {
  const source = await readFile(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = sourceFile.parseDiagnostics;
  if (diagnostics.length > 0) {
    throw new Error(`Cannot format ${path}: ${diagnostics[0]?.messageText ?? "parse error"}`);
  }
  await writeFile(path, printer.printFile(sourceFile));
}
