/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { applyAssistantUiPatch } = require("./assistant-ui-patch-lib.cjs");

const resolveTargetPaths = () => {
  const nodeModulesRoot = path.join(__dirname, "..", "node_modules", "@assistant-ui");
  return [
    path.join(
      nodeModulesRoot,
      "core",
      "dist",
      "runtime",
      "base",
      "default-edit-composer-runtime-core.js",
    ),
    path.join(
      nodeModulesRoot,
      "react",
      "dist",
      "runtimes",
      "composer",
      "DefaultEditComposerRuntimeCore.js",
    ),
  ];
};

const patchFile = (targetPath) => {
  if (!fs.existsSync(targetPath)) return "missing-file";
  const source = fs.readFileSync(targetPath, "utf8");
  const result = applyAssistantUiPatch(source);

  if (result.status === "missing-source-block") {
    return "missing-source-block";
  }

  if (result.status === "already-applied") {
    return "already-applied";
  }

  fs.writeFileSync(targetPath, result.nextSource, "utf8");
  return result.status;
};

const targetPaths = resolveTargetPaths();
let appliedCount = 0;
let alreadyAppliedCount = 0;
let missingFileCount = 0;

for (const targetPath of targetPaths) {
  const status = patchFile(targetPath);
  if (status === "missing-file") {
    missingFileCount += 1;
    continue;
  }
  if (status === "already-applied") {
    alreadyAppliedCount += 1;
    console.log(`[assistant-ui-patch] Patch already applied: ${targetPath}`);
    continue;
  }
  if (status === "missing-source-block") {
    console.warn(`[assistant-ui-patch] Could not patch unsupported file shape: ${targetPath}`);
    continue;
  }
  appliedCount += 1;
  console.log(`[assistant-ui-patch] Patch ${status} for: ${targetPath}`);
}

if (appliedCount === 0 && alreadyAppliedCount === 0 && missingFileCount === targetPaths.length) {
  console.warn("[assistant-ui-patch] No known edit composer target files were found.");
  process.exit(0);
}

if (appliedCount === 0 && alreadyAppliedCount === 0) {
  console.error("[assistant-ui-patch] Unable to patch any edit composer runtime.");
  process.exit(1);
}

console.log("[assistant-ui-patch] Patch step completed.");
