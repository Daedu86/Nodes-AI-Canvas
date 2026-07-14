import { readFileSync, writeFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => writeFileSync(path, content, "utf8");

function replaceOnce(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${count}.`);
  }
  return content.replace(before, after);
}

function createNew(path, content) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite ${path}.`);
  write(path, content);
}

let packageJson = read("package.json");
packageJson = replaceOnce(
  packageJson,
  '    "build": "next build",\n',
  '    "build": "next build",\n    "bundle:budget": "node scripts/check-bundle-budget.mjs",\n',
  "package build script",
);
write("package.json", packageJson);

createNew(
  "lib/client/workspace-onboarding.ts",
  `export const WORKSPACE_ONBOARDING_STORAGE_KEY =
  "nodes.workspace-onboarding.completed.v1";

export const isWorkspaceOnboardingComplete = (storedValue: string | null) =>
  storedValue === "1";
`,
);

createNew(
  "components/workspace/workspace-onboarding-dialog.tsx",
  `"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp, MessageSquareText, Network, Workflow, X } from "lucide-react";
import React from "react";
import {
  isWorkspaceOnboardingComplete,
  WORKSPACE_ONBOARDING_STORAGE_KEY,
} from "@/lib/client/workspace-onboarding";

type WorkspaceOnboardingDialogProps = {
  onOpenCanvas: () => void;
};

const onboardingSteps = [
  {
    description: "Start with a concrete question or decision in Chat.",
    icon: MessageSquareText,
    title: "Ask",
  },
  {
    description: "Open Canvas to see branches, alternatives, and reusable context.",
    icon: Workflow,
    title: "Explore",
  },
  {
    description: "Add blocks and connect evidence, files, plans, and outputs.",
    icon: Network,
    title: "Structure",
  },
];

export function WorkspaceOnboardingDialog({
  onOpenCanvas,
}: WorkspaceOnboardingDialogProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setOpen(!isWorkspaceOnboardingComplete(localStorage.getItem(WORKSPACE_ONBOARDING_STORAGE_KEY)));
    } catch {
      setOpen(false);
    }
  }, []);

  const completeOnboarding = React.useCallback(() => {
    try {
      localStorage.setItem(WORKSPACE_ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures; the dialog remains manually accessible.
    }
    setOpen(false);
  }, []);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) completeOnboarding();
      else setOpen(true);
    },
    [completeOnboarding],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open workspace guide"
          title="Workspace guide"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border/70 bg-background p-6 shadow-2xl focus:outline-none sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                Workspace guide
              </p>
              <Dialog.Title className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Turn a question into a structured decision
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Nodes combines a conversational thread with a visual canvas. You can move between both without losing context.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close workspace guide"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {onboardingSteps.map(({ description, icon: Icon, title }, index) => (
              <li key={title} className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">0{index + 1}</span>
                </div>
                <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-border/70 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={completeOnboarding}
            >
              Got it
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                onOpenCanvas();
                completeOnboarding();
              }}
            >
              <Workflow className="h-4 w-4" />
              Open split workspace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
`,
);

let appHeader = read("components/workspace/app-header.tsx");
appHeader = replaceOnce(
  appHeader,
  'import { SessionContextSheet } from "@/components/workspace/session-context-sheet";\n',
  'import { SessionContextSheet } from "@/components/workspace/session-context-sheet";\nimport { WorkspaceOnboardingDialog } from "@/components/workspace/workspace-onboarding-dialog";\n',
  "onboarding import",
);
appHeader = replaceOnce(
  appHeader,
  '      <div className="ml-auto flex items-center gap-2">\n        <ModelSelector />\n',
  '      <div className="ml-auto flex items-center gap-2">\n        <WorkspaceOnboardingDialog onOpenCanvas={() => setViewMode("split")} />\n        <ModelSelector />\n',
  "header onboarding trigger",
);
write("components/workspace/app-header.tsx", appHeader);

let splitLayout = read("components/workspace/workspace-split-layout.tsx");
splitLayout = replaceOnce(
  splitLayout,
  `const WorkspacePanelShell = ({ children }: { children: React.ReactNode }) => (
  <div className={shellClassName}>
    <div className={shellInnerClassName}>{children}</div>
  </div>
);
`,
  `const WorkspacePanelShell = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <section aria-label={label} className={shellClassName}>
    <div className={shellInnerClassName}>{children}</div>
  </section>
);
`,
  "workspace panel shell",
);
splitLayout = replaceOnce(
  splitLayout,
  `const SinglePanelLayer = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => (
  <div
    aria-hidden={!active}
    className={
`,
  `const SinglePanelLayer = ({
  active,
  children,
  label,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
}) => (
  <div
    aria-hidden={!active}
    inert={!active}
    className={
`,
  "single panel layer signature",
);
splitLayout = replaceOnce(
  splitLayout,
  `    <WorkspacePanelShell>{children}</WorkspacePanelShell>
`,
  `    <WorkspacePanelShell label={label}>{children}</WorkspacePanelShell>
`,
  "single panel labeled shell",
);
splitLayout = replaceOnce(
  splitLayout,
  `          <SinglePanelLayer active={viewMode === "chat"}>{chatPanel}</SinglePanelLayer>
          <SinglePanelLayer active={viewMode === "canvas"}>{canvasPanel}</SinglePanelLayer>
`,
  `          <SinglePanelLayer active={viewMode === "chat"} label="Chat workspace">
            {chatPanel}
          </SinglePanelLayer>
          <SinglePanelLayer active={viewMode === "canvas"} label="Canvas workspace">
            {canvasPanel}
          </SinglePanelLayer>
`,
  "single panel layers",
);
splitLayout = replaceOnce(
  splitLayout,
  `                <WorkspacePanelShell>{pane.panel}</WorkspacePanelShell>
`,
  `                <WorkspacePanelShell label={\`${pane.label} workspace\`}>
                  {pane.panel}
                </WorkspacePanelShell>
`,
  "split panel shell",
);
write("components/workspace/workspace-split-layout.tsx", splitLayout);

let stage = read("components/assistant-ui/thread-graph-flow/canvas-stage.tsx");
stage = replaceOnce(
  stage,
  '      <div className="flex h-full min-h-[28rem] items-center justify-center rounded-[32px] border border-white/70 bg-background/80 text-sm text-muted-foreground dark:border-white/10">\n        Loading 3D canvas…\n',
  '      <div role="status" aria-live="polite" className="flex h-full min-h-[28rem] items-center justify-center rounded-[32px] border border-white/70 bg-background/80 text-sm text-muted-foreground dark:border-white/10">\n        Loading 3D canvas…\n',
  "3D loading status",
);
stage = replaceOnce(
  stage,
  `    <div
      ref={viewportRef}
      className="relative min-h-[28rem] flex-1 lg:min-h-0"
`,
  `    <div
      ref={viewportRef}
      role="region"
      aria-label="Conversation canvas"
      aria-describedby="canvas-stage-instructions"
      className="relative min-h-[28rem] flex-1 lg:min-h-0"
`,
  "canvas stage landmark",
);
stage = replaceOnce(
  stage,
  `    >
      {flowRenderMode === "3d" ? (
`,
  `    >
      <p id="canvas-stage-instructions" className="sr-only">
        Use Tab to reach canvas controls and graph elements. Select a node to inspect it. Double-click a conversation node to open it in Chat.
      </p>
      {flowRenderMode === "3d" ? (
`,
  "canvas stage instructions",
);
stage = replaceOnce(
  stage,
  `            key={\`flow:${activeSessionId}\`}
            data-graph-structure={graphStructureSignature}
`,
  `            key={\`flow:${activeSessionId}\`}
            aria-label="Conversation graph"
            data-graph-structure={graphStructureSignature}
`,
  "React Flow label",
);
write("components/assistant-ui/thread-graph-flow/canvas-stage.tsx", stage);

let sidebar = read("components/assistant-ui/thread-graph-flow/canvas-sidebar.tsx");
sidebar = replaceOnce(
  sidebar,
  `    <aside
      ref={toolbarMenuRef}
`,
  `    <aside
      ref={toolbarMenuRef}
      aria-label="Canvas controls and inspector"
`,
  "canvas sidebar label",
);
sidebar = replaceOnce(
  sidebar,
  '        <div className="mt-3 flex flex-wrap gap-2">\n',
  '        <div aria-live="polite" className="mt-3 flex flex-wrap gap-2">\n',
  "canvas counts live region",
);
sidebar = replaceOnce(
  sidebar,
  '          <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">\n',
  '          <div role="status" aria-live="polite" className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">\n',
  "run status",
);
sidebar = replaceOnce(
  sidebar,
  '        <div className="flex items-center rounded-full border border-border/60 bg-background/92 p-1 text-[11px] font-medium text-muted-foreground shadow-sm">\n',
  '        <div role="group" aria-label="Canvas render mode" className="flex items-center rounded-full border border-border/60 bg-background/92 p-1 text-[11px] font-medium text-muted-foreground shadow-sm">\n',
  "render mode group",
);
sidebar = replaceOnce(
  sidebar,
  `              onClick={() => onFlowRenderModeChange(mode)}
              aria-label={\`Switch canvas to ${mode.toUpperCase()}\`}
`,
  `              onClick={() => onFlowRenderModeChange(mode)}
              aria-label={\`Switch canvas to ${mode.toUpperCase()}\`}
              aria-pressed={flowRenderMode === mode}
`,
  "render mode pressed state",
);
sidebar = replaceOnce(
  sidebar,
  '            <div className="mt-2 w-full rounded-[18px] border border-white/70 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-slate-950/92">\n',
  '            <div role="menu" aria-label="Canvas tools" className="mt-2 w-full rounded-[18px] border border-white/70 bg-white/90 p-2 shadow-sm dark:border-white/10 dark:bg-slate-950/92">\n',
  "tools menu role",
);
sidebar = replaceOnce(
  sidebar,
  `                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
`,
  `                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
`,
  "first menu item role",
);
sidebar = replaceOnce(
  sidebar,
  `                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
`,
  `                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors hover:bg-background/85"
`,
  "second menu item role",
);
sidebar = replaceOnce(
  sidebar,
  '          <div className="flex flex-wrap items-center gap-2">\n            {(Object.keys(flowFilterLabel)',
  '          <div role="group" aria-label="Canvas spotlight filters" className="flex flex-wrap items-center gap-2">\n            {(Object.keys(flowFilterLabel)',
  "spotlight group",
);
sidebar = replaceOnce(
  sidebar,
  `                onClick={() => onSpotlightChange(mode)}
              >
`,
  `                onClick={() => onSpotlightChange(mode)}
                aria-pressed={spotlight === mode}
              >
`,
  "spotlight pressed state",
);
sidebar = replaceOnce(
  sidebar,
  '            <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-700 dark:text-rose-200">\n',
  '            <p role="status" aria-live="polite" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-700 dark:text-rose-200">\n',
  "link edit live status",
);
write("components/assistant-ui/thread-graph-flow/canvas-sidebar.tsx", sidebar);

createNew(
  "scripts/check-bundle-budget.mjs",
  `import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_BUNDLE_BUDGET = {
  maxSingleGzipBytes: 1_200_000,
  maxTotalGzipBytes: 6_000_000,
};

export function evaluateBundleBudget(assets, budget = DEFAULT_BUNDLE_BUDGET) {
  const sorted = [...assets].sort((a, b) => b.gzipBytes - a.gzipBytes);
  const totalGzipBytes = sorted.reduce((total, asset) => total + asset.gzipBytes, 0);
  const largest = sorted[0] ?? null;
  const violations = [];

  if (largest && largest.gzipBytes > budget.maxSingleGzipBytes) {
    violations.push(
      \`Largest JavaScript chunk \${largest.path} is \${largest.gzipBytes} bytes gzip; budget is \${budget.maxSingleGzipBytes}.\`,
    );
  }
  if (totalGzipBytes > budget.maxTotalGzipBytes) {
    violations.push(
      \`Total JavaScript is \${totalGzipBytes} bytes gzip; budget is \${budget.maxTotalGzipBytes}.\`,
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
          path: relative(root, path).replaceAll("\\\\", "/"),
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
    console.log(\`- \${asset.path}: \${asset.gzipBytes} bytes gzip (\${asset.rawBytes} raw)\`);
  });
  console.log(\`Total JavaScript gzip size: \${result.totalGzipBytes} bytes\`);

  if (result.violations.length > 0) {
    throw new Error(result.violations.join("\\n"));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
`,
);

createNew(
  "tests/bundle-budget.test.mjs",
  `import { describe, expect, it } from "vitest";
import { evaluateBundleBudget } from "../scripts/check-bundle-budget.mjs";

describe("evaluateBundleBudget", () => {
  it("accepts assets inside both budgets and reports the largest chunk", () => {
    const result = evaluateBundleBudget(
      [
        { gzipBytes: 120, path: "small.js", rawBytes: 300 },
        { gzipBytes: 240, path: "large.js", rawBytes: 700 },
      ],
      { maxSingleGzipBytes: 300, maxTotalGzipBytes: 500 },
    );

    expect(result.largest?.path).toBe("large.js");
    expect(result.totalGzipBytes).toBe(360);
    expect(result.violations).toEqual([]);
  });

  it("reports single-chunk and total-size violations independently", () => {
    const result = evaluateBundleBudget(
      [
        { gzipBytes: 350, path: "large.js", rawBytes: 900 },
        { gzipBytes: 200, path: "other.js", rawBytes: 500 },
      ],
      { maxSingleGzipBytes: 300, maxTotalGzipBytes: 500 },
    );

    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toContain("large.js");
    expect(result.violations[1]).toContain("Total JavaScript");
  });
});
`,
);

createNew(
  "tests/workspace-onboarding.test.ts",
  `import { describe, expect, it } from "vitest";
import {
  isWorkspaceOnboardingComplete,
  WORKSPACE_ONBOARDING_STORAGE_KEY,
} from "@/lib/client/workspace-onboarding";

describe("workspace onboarding state", () => {
  it("uses a versioned storage key", () => {
    expect(WORKSPACE_ONBOARDING_STORAGE_KEY).toBe(
      "nodes.workspace-onboarding.completed.v1",
    );
  });

  it("only treats the explicit completion marker as complete", () => {
    expect(isWorkspaceOnboardingComplete("1")).toBe(true);
    expect(isWorkspaceOnboardingComplete(null)).toBe(false);
    expect(isWorkspaceOnboardingComplete("0")).toBe(false);
  });
});
`,
);

console.log("Accessibility, onboarding, and bundle-budget changes prepared.");
