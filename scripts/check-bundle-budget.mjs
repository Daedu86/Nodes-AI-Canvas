import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BUNDLE_BUDGET = {
  maxSingleGzipBytes: 400_000,
  maxTotalGzipBytes: 1_500_000,
};

export function evaluateBundleBudget(assets, budget = DEFAULT_BUNDLE_BUDGET) {
  const sorted = [...assets].sort((a, b) => b.gzipBytes - a.gzipBytes);
  const totalGzipBytes = sorted.reduce((total, asset) => total + asset.gzipBytes, 0);
  const largest = sorted[0] ?? null;
  const violations = [];

  if (largest && largest.gzipBytes > budget.maxSingleGzipBytes) {
    violations.push(
      `Largest JavaScript chunk ${largest.path} is ${largest.gzipBytes} bytes gzip; budget is ${budget.maxSingleGzipBytes}.`,
    );
  }
  if (totalGzipBytes > budget.maxTotalGzipBytes) {
    violations.push(
      `Total JavaScript is ${totalGzipBytes} bytes gzip; budget is ${budget.maxTotalGzipBytes}.`,
    );
  }

  return { largest, sorted, totalGzipBytes, violations };
}

async function collectJavaScriptAssets(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScriptAssets(path, root);
      if (!entry.isFile() || !entry.name.endsWith(".js")) return [];
      const source = await readFile(path);
      return [
        {
          gzipBytes: gzipSync(source).byteLength,
          path: relative(root, path).replaceAll("\\", "/"),
          rawBytes: source.byteLength,
        },
      ];
    }),
  );
  return nested.flat();
}

async function main() {
  const assets = await collectJavaScriptAssets(join(process.cwd(), ".next", "static", "chunks"));
  if (assets.length === 0) throw new Error("No built JavaScript chunks were found.");

  const budget = {
    maxSingleGzipBytes: Number(process.env.BUNDLE_MAX_SINGLE_GZIP_BYTES) || DEFAULT_BUNDLE_BUDGET.maxSingleGzipBytes,
    maxTotalGzipBytes: Number(process.env.BUNDLE_MAX_TOTAL_GZIP_BYTES) || DEFAULT_BUNDLE_BUDGET.maxTotalGzipBytes,
  };
  const result = evaluateBundleBudget(assets, budget);
  console.log("Largest JavaScript chunks (gzip):");
  result.sorted.slice(0, 10).forEach((asset) => {
    console.log(`- ${asset.path}: ${asset.gzipBytes} bytes gzip (${asset.rawBytes} raw)`);
  });
  console.log(`Total JavaScript gzip size: ${result.totalGzipBytes} bytes`);

  if (result.violations.length > 0) {
    throw new Error(result.violations.join("\n"));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
