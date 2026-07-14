import fs from "node:fs";

const path = "playwright.config.ts";
let source = fs.readFileSync(path, "utf8");
const before = '    permissions: ["clipboard-read", "clipboard-write"],';
const after =
  '    permissions: browserName === "chromium" ? ["clipboard-read", "clipboard-write"] : [],';
if (!source.includes(before)) {
  throw new Error("Could not locate Playwright clipboard permissions.");
}
source = source.replace(before, after);
fs.writeFileSync(path, source);
