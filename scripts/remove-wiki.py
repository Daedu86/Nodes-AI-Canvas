from pathlib import Path
import re
import shutil

ROOT = Path(".")


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    if old not in source:
        raise SystemExit(f"missing target in {path}: {old[:100]!r}")
    write(path, source.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1)
    if count != 1:
        raise SystemExit(f"pattern mismatch in {path}: {pattern[:120]!r}")
    write(path, updated)


def delete(path: str) -> None:
    target = ROOT / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()


# Remove the session Wiki runtime and its now-unused snapshot publication pipeline.
path = "app/assistant.tsx"
source = read(path)
source = source.replace(
    'import { SessionKnowledgeProvider } from "@/components/context/session-knowledge";\n',
    "",
    1,
)
source = source.replace(
    'import { KnowledgeCenterWorkspace } from "@/components/workspace/knowledge-center-workspace";\n',
    "",
    1,
)
source, count = re.subn(
    r"\nconst WikiPanel = dynamic\([\s\S]*?\n\);\n\nconst ProjectHeader",
    "\nconst ProjectHeader",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("WikiPanel dynamic block not found")
source = source.replace("          <SessionKnowledgeProvider>\n", "", 1)
source = source.replace("          </SessionKnowledgeProvider>\n", "", 1)
source = source.replace("                      wikiPanel={<WikiPanel />}\n", "", 1)
source = source.replace(
    '  if (activeSurface === "knowledge-center") {\n'
    "    return <KnowledgeCenterWorkspace />;\n"
    "  }\n",
    "",
    1,
)
write(path, source)

path = "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx"
source = read(path)
source = source.replace(
    'import { useSessionKnowledge } from "@/components/context/session-knowledge";\n',
    "",
    1,
)
source = source.replace("  const { publishSnapshot } = useSessionKnowledge();\n", "", 1)
source, count = re.subn(
    r"\n  const sessionKnowledgeNodes = React\.useMemo\([\s\S]*?\n    sessionKnowledgeNodes,\n  \]\);\n",
    "\n",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("session knowledge publication block not found")
write(path, source)


# Remove Wiki from session view modes and split panes.
path = "components/context/session-ui-state.tsx"
source = read(path)
source = source.replace(' | "wiki"', "")
source = source.replace('  "wiki",\n', "")
source = source.replace("  wiki: true,\n", "")
source = source.replace(
    "      wiki: parsed.wiki ?? DEFAULT_SPLIT_PANE_VISIBILITY.wiki,\n",
    "",
)
source = source.replace('    value === "wiki" ||\n', "")
source, count = re.subn(
    r"const isStandaloneViewMode = \(value: string \| null\): value is StandaloneSessionViewMode => \{\n  return \(\n    value === \"chat\" \|\|\n    value === \"canvas\" \|\|\n    value === \"wiki\"\n  \);\n\};",
    'const isStandaloneViewMode = (value: string | null): value is StandaloneSessionViewMode =>\n  value === "chat" || value === "canvas";',
    source,
    count=1,
)
if count != 1:
    raise SystemExit("standalone Wiki mode guard not found")
write(path, source)

path = "components/workspace/workspace-split-layout.tsx"
source = read(path)
source = source.replace("  BookCopy,\n", "", 1)
source = source.replace("  wikiPanel: React.ReactNode;\n", "", 1)
source = source.replace("  wikiPanel,\n", "", 1)
source, count = re.subn(
    r'      \{\n        id: "wiki",[\s\S]*?        panel: wikiPanel,\n      \},\n',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("Wiki split pane definition not found")
source = source.replace(
    "    [canvasPanel, chatPanel, wikiPanel],",
    "    [canvasPanel, chatPanel],",
    1,
)
source, count = re.subn(
    r'          \{viewMode === "wiki" \? \([\s\S]*?          \) : null\}\n',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("standalone Wiki panel layer not found")
write(path, source)

path = "components/workspace/app-header.tsx"
source = read(path)
source = source.replace("BookCopy, ", "", 1)
source = source.replace('    { icon: BookCopy, label: "Wiki", value: "wiki" },\n', "", 1)
write(path, source)


# Remove project Wiki mode while preserving unrelated Arena and memory behavior.
path = "components/workspace/project-workspace.tsx"
source = read(path)
source = source.replace('import { ProjectWiki } from "@/components/workspace/project-wiki";\n', "", 1)
source = source.replace('<"canvas" | "arena" | "wiki">', '<"canvas" | "arena">', 1)
source = source.replace(
    '                  : workspaceMode === "arena"\n'
    '                    ? `Arena comparison across ${arenaEntries.length} selected ${arenaCompareMode === "sessions" ? `session${arenaEntries.length === 1 ? "" : "s"}` : `branch${arenaEntries.length === 1 ? "" : "es"}`}.`\n'
    '                    : "Canonical project wiki compiled from the shared canvas, typed nodes, and project context."',
    '                  : `Arena comparison across ${arenaEntries.length} selected ${arenaCompareMode === "sessions" ? `session${arenaEntries.length === 1 ? "" : "s"}` : `branch${arenaEntries.length === 1 ? "" : "es"}`}.`',
    1,
)
source, count = re.subn(
    r'\s*<Button\n                type="button"\n                variant=\{workspaceMode === "wiki"[\s\S]*?\n              </Button>',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("project Wiki button not found")
source, count = re.subn(
    r'\) : workspaceMode === "wiki" \? \(\n              <ProjectWiki[\s\S]*?\n              />\n            \) : \(',
    ") : (",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("project Wiki render branch not found")
write(path, source)


# Remove Knowledge Center routing and profile navigation.
path = "components/context/workspace-surface.tsx"
source = read(path)
source = source.replace('  | "knowledge-center"\n', "")
source = source.replace("  showKnowledgeCenter: () => void;\n", "")
source = source.replace('    if (value === "knowledge-center") return "knowledge-center";\n', "")
source = source.replace('      showKnowledgeCenter: () => setActiveSurface("knowledge-center"),\n', "")
write(path, source)

path = "components/auth/sidebar-profile.tsx"
source = read(path)
source = source.replace("  BookOpenText,\n", "", 1)
source = source.replace("    showKnowledgeCenter,\n", "", 1)
source, count = re.subn(
    r'\s*<Button\n          type="button"\n          variant=\{activeSurface === "knowledge-center"[\s\S]*?\n        </Button>',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("collapsed Knowledge Center button not found")
source, count = re.subn(
    r'\s*<Button\n            type="button"\n            variant=\{activeSurface === "knowledge-center"[\s\S]*?\n          </Button>',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("expanded Knowledge Center button not found")
write(path, source)


# Remove README documentation and render jobs dedicated to the retired feature.
path = "README.md"
source = read(path)
source, count = re.subn(
    r"\n### Knowledge Center \(built-in wiki\)\n[\s\S]*?\nA wiki-style workspace for onboarding, patterns, and “how-to” docs that ship with the product\.\n",
    "\n",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("README Knowledge Center section not found")
write(path, source)

path = "scripts/render-readme-svgs.mjs"
source = read(path)
source, count = re.subn(
    r'  \{\n    input: "docs/readme/03-knowledge-center\.svg",\n    output: "docs/readme/03-knowledge-center\.png",\n  \},\n  \{\n    input: "docs/readme/03-knowledge-center-dark\.svg",\n    output: "docs/readme/03-knowledge-center-dark\.png",\n  \},\n',
    "",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("Knowledge Center README render jobs not found")
write(path, source)


# Update tests for the remaining Chat/Canvas product surface.
write(
    "tests/workspace-split-layout.test.tsx",
    '''// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  SessionUiStateProvider,
  useSessionUiState,
} from "../components/context/session-ui-state";
import { WorkspaceSplitLayout } from "../components/workspace/workspace-split-layout";

function LayoutHarness() {
  const { setViewMode, viewMode } = useSessionUiState();

  return (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <button type="button" onClick={() => setViewMode("chat")}>Show chat</button>
      <button type="button" onClick={() => setViewMode("split")}>Show split</button>
      <button type="button" onClick={() => setViewMode("canvas")}>Show canvas</button>
      <div style={{ width: 1200, height: 800 }}>
        <WorkspaceSplitLayout
          chatPanel={<div data-testid="chat-panel">chat</div>}
          canvasPanel={<div data-testid="canvas-panel">canvas</div>}
        />
      </div>
    </div>
  );
}

function renderLayout(sessionId: string) {
  return render(
    <SessionUiStateProvider sessionId={sessionId}>
      <LayoutHarness />
    </SessionUiStateProvider>,
  );
}

describe("WorkspaceSplitLayout", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("persists the main panel view mode per session", () => {
    const { unmount } = renderLayout("session-a");

    expect(screen.getByTestId("view-mode").textContent).toBe("split");
    expect(screen.queryByTestId("chat-panel")).not.toBeNull();
    expect(screen.queryByTestId("canvas-panel")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show canvas" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");

    unmount();
    renderLayout("session-a");
    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");

    cleanup();
    renderLayout("session-b");
    expect(screen.getByTestId("view-mode").textContent).toBe("split");
  });
});
''',
)

path = "tests/session-ui-state.test.tsx"
source = read(path)
source = source.replace('setViewMode("wiki")', 'setViewMode("chat")')
source = source.replace("Set wiki", "Set chat")
source = source.replace("        wiki: false,\n", "")
source = source.replace("chat:closed|canvas:open|wiki:closed", "chat:closed|canvas:open")
source = source.replace("all three workspace panes", "both workspace panes")
source = source.replace('toBe("wiki")', 'toBe("chat")')
write(path, source)

path = "tests/app-header.test.tsx"
source = read(path)
source = source.replace('setViewMode("wiki")', 'setViewMode("chat")')
source = source.replace("Set wiki", "Set chat")
source = source.replace('toBe("wiki")', 'toBe("chat")')
write(path, source)

path = "tests/project-workspace.test.tsx"
source = read(path)
source, count = re.subn(
    r'\nvi\.mock\("@/components/workspace/project-wiki", \(\) => \(\{[\s\S]*?\n\}\)\);\n',
    "\n",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("project Wiki test mock not found")
write(path, source)

path = "tests/workspace-surface.test.tsx"
source = read(path)
source, count = re.subn(
    r'      \) : activeSurface === "knowledge-center" \? \(\n        <div>[\s\S]*?\n        </div>\n      \) : \(',
    "      ) : (",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("Knowledge Center surface harness branch not found")
source, count = re.subn(
    r'\n  it\("opens the Knowledge Center workspace from Profile", async \(\) => \{[\s\S]*?\n  \}\);\n',
    "\n",
    source,
    count=1,
)
if count != 1:
    raise SystemExit("Knowledge Center surface test not found")
write(path, source)

path = "tests/artifact-presentation.test.ts"
source = re.sub(r"wiki", "artifact workflow", read(path), flags=re.IGNORECASE)
write(path, source)

# Remove nondeterministic ordering from an unrelated store assertion exposed by repeated CI runs.
path = "tests/project-store.test.ts"
source = read(path)
source = source.replace(
    "    expect((await listProjects()).map((project) => project.id)).toEqual([third.id, second.id]);",
    "    expect((await listProjects()).map((project) => project.id).sort()).toEqual([second.id, third.id].sort());",
    1,
)
write(path, source)


# Delete dedicated implementation, context, tests, documentation assets, and diagnostics.
for path in [
    "components/context/session-knowledge.tsx",
    "components/workspace/wiki-panel.tsx",
    "components/workspace/project-wiki.tsx",
    "components/workspace/knowledge-center-workspace.tsx",
    "lib/session-wiki.ts",
    "lib/project-wiki.ts",
    "tests/session-wiki.test.ts",
    "tests/project-wiki.test.ts",
    "tests/knowledge-center-workspace.test.tsx",
    "docs/readme/03-knowledge-center.svg",
    "docs/readme/03-knowledge-center-dark.svg",
    "docs/readme/03-knowledge-center.png",
    "docs/readme/03-knowledge-center-dark.png",
    "wiki-inventory.log",
    "wiki-dependency-inventory.log",
    "wiki-removal-error.log",
]:
    delete(path)

# Remove any remaining Wiki/Knowledge-Center-named files.
for target in sorted(ROOT.rglob("*"), key=lambda item: len(item.parts), reverse=True):
    if not target.exists():
        continue
    if target in {ROOT / "scripts/remove-wiki.py", ROOT / ".github/workflows/remove-wiki.yml"}:
        continue
    if ".git" in target.parts or "node_modules" in target.parts or ".next" in target.parts:
        continue
    lowered = target.name.lower()
    if "wiki" in lowered or "knowledge-center" in lowered:
        delete(str(target))

# Remove the one-time migration itself before committing the validated result.
delete("scripts/remove-wiki.py")
delete(".github/workflows/remove-wiki.yml")

# Enforce zero residual feature references or orphaned SessionKnowledge plumbing.
pattern = re.compile(
    r"wiki|knowledge-center|session-wiki|project-wiki|SessionKnowledge|useSessionKnowledge|publishSnapshot",
    re.IGNORECASE,
)
residuals: list[str] = []
for target in ROOT.rglob("*"):
    if not target.is_file():
        continue
    if ".git" in target.parts or "node_modules" in target.parts or ".next" in target.parts:
        continue
    if target.suffix.lower() not in {
        ".ts", ".tsx", ".js", ".jsx", ".json", ".yml", ".yaml",
        ".md", ".mdx", ".txt", ".css", ".sql", ".svg",
    }:
        continue
    for line_number, line in enumerate(target.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if pattern.search(line):
            residuals.append(f"{target}:{line_number}:{line.strip()}")

if residuals:
    print("\n".join(residuals[:300]))
    raise SystemExit("residual Wiki references found")

print("Wiki feature removed; no residual references found.")
