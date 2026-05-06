import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = process.cwd();

const jobs = [
  {
    input: "docs/readme/01-chat-branching.svg",
    output: "docs/readme/01-chat-branching.png",
  },
  {
    input: "docs/readme/01-chat-branching-dark.svg",
    output: "docs/readme/01-chat-branching-dark.png",
  },
  {
    input: "docs/readme/02-canvas-artifacts.svg",
    output: "docs/readme/02-canvas-artifacts.png",
  },
  {
    input: "docs/readme/02-canvas-artifacts-dark.svg",
    output: "docs/readme/02-canvas-artifacts-dark.png",
  },
  {
    input: "docs/readme/03-knowledge-center.svg",
    output: "docs/readme/03-knowledge-center.png",
  },
  {
    input: "docs/readme/03-knowledge-center-dark.svg",
    output: "docs/readme/03-knowledge-center-dark.png",
  },
  {
    input: "docs/readme/04-llm-models.svg",
    output: "docs/readme/04-llm-models.png",
  },
  {
    input: "docs/readme/04-llm-models-dark.svg",
    output: "docs/readme/04-llm-models-dark.png",
  },
];

function parseSvgViewport(svgText) {
  const widthMatch = svgText.match(/\bwidth\s*=\s*"(\d+(?:\.\d+)?)"/i);
  const heightMatch = svgText.match(/\bheight\s*=\s*"(\d+(?:\.\d+)?)"/i);
  const width = widthMatch ? Math.round(Number(widthMatch[1])) : 1200;
  const height = heightMatch ? Math.round(Number(heightMatch[1])) : 675;
  return { width, height };
}

function buildSvgHtml(svgText) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; }
    </style>
  </head>
  <body>
    ${svgText}
  </body>
</html>`;
}

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const inputPath = path.join(repoRoot, job.input);
    const outputPath = path.join(repoRoot, job.output);
    const svgText = await fs.readFile(inputPath, "utf8");
    const { width, height } = parseSvgViewport(svgText);

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.setContent(buildSvgHtml(svgText), { waitUntil: "load" });
    await page.waitForTimeout(50);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, type: "png" });
    await context.close();

    process.stdout.write(`Rendered ${job.output}\n`);
  }
} finally {
  await browser.close();
}

