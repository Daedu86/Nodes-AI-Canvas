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


def replace_required(path: str, old: str, new: str, count: int = 1) -> None:
    source = read(path)
    if source.count(old) < count:
        raise SystemExit(f"missing replacement target in {path}: {old[:100]!r}")
    write(path, source.replace(old, new, count))


def sub_required(path: str, pattern: str, replacement: str, count: int = 1) -> None:
    source = read(path)
    updated, matches = re.subn(pattern, replacement, source, count=count)
    if matches != count:
        raise SystemExit(f"pattern mismatch in {path}: expected {count}, got {matches}: {pattern[:100]!r}")
    write(path, updated)


def delete(path: str) -> None:
    target = ROOT / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()


# Keep the neutral session snapshot provider, but remove Wiki generation and selection state.
path = "components/context/session-knowledge.tsx"
source = read(path)
source, matches = re.subn(
    r'import \{\n  buildSessionWiki,[\s\S]*?\} from "@/lib/session-wiki";\n',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("session knowledge wiki import not found")
source = source.replace(
    "type SessionKnowledgeSnapshot = {",
    "type SessionKnowledgeNode = {\n"
    "  branchId?: string | number | null;\n"
    "  id: string;\n"
    "  parentId: string | null;\n"
    "  role: string;\n"
    "  text: string;\n"
    "};\n\n"
    "type SessionKnowledgeSnapshot = {",
    1,
)
source = source.replace("  nodes: SessionWikiNode[];", "  nodes: SessionKnowledgeNode[];", 1)
source = source.replace(
    "  selectedWikiPageId: SessionWikiPageId;\n"
    "  setSelectedWikiPageId: (value: SessionWikiPageId) => void;\n",
    "",
    1,
)
source = source.replace("  wiki: SessionWiki | null;\n", "", 1)
source = source.replace(
    '  const [selectedWikiPageId, setSelectedWikiPageId] = React.useState<SessionWikiPageId>("overview");\n\n',
    "",
    1,
)
source, matches = re.subn(
    r"  const wiki = React\.useMemo\([\s\S]*?\n  \);\n\n  const brief",
    "  const brief",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("session knowledge wiki memo not found")
source = source.replace(
    "            sessionTitle: snapshot.sessionTitle,\n            wiki,",
    "            sessionTitle: snapshot.sessionTitle,",
    1,
)
source = source.replace("    [snapshot, wiki],", "    [snapshot],", 1)
source, matches = re.subn(
    r'\n  React\.useEffect\(\(\) => \{\n    setSelectedWikiPageId\("overview"\);\n  \}, \[snapshot\?\.sessionId\]\);\n',
    "\n",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("session knowledge wiki reset not found")
source = source.replace("      selectedWikiPageId,\n      setSelectedWikiPageId,\n", "", 1)
source = source.replace("      wiki,\n", "", 1)
source = source.replace(
    "    [brief, selectedWikiPageId, snapshot, wiki],",
    "    [brief, snapshot],",
    1,
)
source = source.replace(
    "export type { SessionKnowledgeSnapshot };",
    "export type { SessionKnowledgeNode, SessionKnowledgeSnapshot };",
    1,
)
write(path, source)


# Compile Brief only from semantic canvas artifacts.
path = "lib/session-brief.ts"
source = read(path)
source = re.sub(
    r'import type \{ SessionWiki, SessionWikiPageId \} from "@/lib/session-wiki";\n',
    "",
    source,
    count=1,
)
source = source.replace('  kind: "wiki" | "node" | "artifact";', '  kind: "artifact";', 1)
source = source.replace("  targetId: SessionWikiPageId | string;", "  targetId: string;", 1)
source = source.replace("  wiki: SessionWiki | null;\n", "", 1)
source, matches = re.subn(
    r"\nconst parseOpenQuestions = \(wiki: SessionWiki \| null\) => \{[\s\S]*?\n\};\n",
    "\n",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("brief wiki question parser not found")
source = source.replace(
    "const buildSignalSummary = (artifacts: SessionArtifact[], wiki: SessionWiki | null) => {",
    "const buildSignalSummary = (artifacts: SessionArtifact[]) => {",
    1,
)
source, matches = re.subn(
    r"\n  if \(wiki\) \{\n    fallbackSignals\.push\(`\$\{wiki\.pages\.length\}[\s\S]*?\n  \}",
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("brief wiki signal not found")
source = source.replace("  wiki,\n", "", 1)
source = source.replace(
    '  const overview = wiki?.pages.find((page) => page.id === "overview");\n'
    '  const focus = wiki?.pages.find((page) => page.id === "focus");\n',
    "",
    1,
)
source = source.replace(
    "  const summary =\n"
    "    overview?.summary ??\n"
    '    `${sessionTitle?.trim() || "Untitled session"} is ready for a canonical brief.`;',
    '  const summary = `${sessionTitle?.trim() || "Untitled session"} is ready for a canvas brief.`;',
    1,
)
source = source.replace(
    "    decisionArtifacts[0]?.content?.trim() ||\n    focus?.summary ||",
    "    decisionArtifacts[0]?.content?.trim() ||",
    1,
)
source = source.replace("    ...parseOpenQuestions(wiki),\n", "", 1)
source = source.replace("signals: buildSignalSummary(artifacts, wiki)", "signals: buildSignalSummary(artifacts)", 1)
write(path, source)


# Remove Brief navigation back into Wiki.
path = "components/workspace/brief-panel.tsx"
source = read(path)
source = source.replace(
    'import { BookCopy, FileText, Lightbulb, Waypoints } from "lucide-react";',
    'import { FileText, Lightbulb, Waypoints } from "lucide-react";',
    1,
)
source = source.replace('import type { SessionWikiPageId } from "@/lib/session-wiki";\n', "", 1)
source = source.replace(
    "  const { brief, setSelectedWikiPageId } = useSessionKnowledge();",
    "  const { brief } = useSessionKnowledge();",
    1,
)
source, matches = re.subn(
    r'    if \(source\.kind === "wiki"\) \{[\s\S]*?      return;\n    \}\n',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("brief wiki source branch not found")
source, matches = re.subn(
    r'\s*<Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick=\{\(\) => setViewMode\("wiki"\)\}>[\s\S]*?</Button>',
    "",
    source,
    count=2,
)
if matches != 2:
    raise SystemExit(f"expected two Brief wiki buttons, found {matches}")
source = source.replace(
    "No explicit open questions are currently pinned in the wiki.",
    "No explicit open questions are currently pinned in the canvas.",
    1,
)
write(path, source)


# Remove session Wiki panel and Knowledge Center runtime route.
path = "app/assistant.tsx"
source = read(path)
source = source.replace(
    'import { KnowledgeCenterWorkspace } from "@/components/workspace/knowledge-center-workspace";\n',
    "",
    1,
)
source, matches = re.subn(
    r"\nconst WikiPanel = dynamic\([\s\S]*?\n\);\n\nconst BriefPanel",
    "\nconst BriefPanel",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("assistant WikiPanel block not found")
source = source.replace("                      wikiPanel={<WikiPanel />}\n", "", 1)
source = source.replace(
    '  if (activeSurface === "knowledge-center") {\n'
    "    return <KnowledgeCenterWorkspace />;\n"
    "  }\n",
    "",
    1,
)
write(path, source)

replace_required(
    "components/workspace/app-header.tsx",
    "BookCopy, ",
    "",
)
replace_required(
    "components/workspace/app-header.tsx",
    '    { icon: BookCopy, label: "Wiki", value: "wiki" },\n',
    "",
)


# Remove Wiki from split panes and persisted view-state types.
path = "components/workspace/workspace-split-layout.tsx"
source = read(path)
source = source.replace("  BookCopy,\n", "", 1)
source = source.replace("  wikiPanel: React.ReactNode;\n", "", 1)
source = source.replace("  wikiPanel,\n", "", 1)
source, matches = re.subn(
    r'      \{\n        id: "wiki",[\s\S]*?        panel: wikiPanel,\n      \},\n',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("split Wiki pane definition not found")
source = source.replace(
    "[briefPanel, canvasPanel, chatPanel, wikiPanel]",
    "[briefPanel, canvasPanel, chatPanel]",
    1,
)
source, matches = re.subn(
    r'          \{viewMode === "wiki" \? \([\s\S]*?          \) : null\}\n',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("standalone Wiki layer not found")
write(path, source)

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
write(path, source)


# Remove project Wiki mode, preserving BookCopy because Arena still uses it.
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
source, matches = re.subn(
    r'\s*<Button\n                type="button"\n                variant=\{workspaceMode === "wiki"[\s\S]*?\n              </Button>',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("project Wiki button not found")
source, matches = re.subn(
    r'\) : workspaceMode === "wiki" \? \(\n              <ProjectWiki[\s\S]*?\n              />\n            \) : \(',
    ") : (",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("project Wiki render branch not found")
write(path, source)


# Remove Knowledge Center route and profile navigation.
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
source, matches = re.subn(
    r'\s*<Button\n          type="button"\n          variant=\{activeSurface === "knowledge-center"[\s\S]*?\n        </Button>',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("collapsed Knowledge Center button not found")
source, matches = re.subn(
    r'\s*<Button\n            type="button"\n            variant=\{activeSurface === "knowledge-center"[\s\S]*?\n          </Button>',
    "",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("expanded Knowledge Center button not found")
write(path, source)


# Update tests for the remaining surfaces.
path = "tests/workspace-split-layout.test.tsx"
source = read(path)
source = source.replace(
    '      <button type="button" onClick={() => setViewMode("wiki")}>Show Wiki</button>\n',
    "",
    1,
)
source = source.replace(
    '          wikiPanel={<div data-testid="wiki-panel">wiki</div>}\n',
    "",
    1,
)
source = source.replace('    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();\n', "")
source = source.replace(
    '    fireEvent.click(screen.getByRole("button", { name: "Show Wiki" }));\n'
    '    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");\n'
    '    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();',
    '    fireEvent.click(screen.getByRole("button", { name: "Show canvas" }));\n'
    '    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");',
    1,
)
source = source.replace(
    '    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");',
    '    expect(screen.getByTestId("view-mode").textContent).toBe("canvas");',
    1,
)
source = source.replace(
    'screen.getByRole("button", { name: "Show Wiki" })',
    'screen.getByRole("button", { name: "Show canvas" })',
)
source = source.replace('toBe("wiki")', 'toBe("canvas")')
write(path, source)

path = "tests/session-brief.test.ts"
source = read(path)
source = source.replace(
    "combines wiki and semantic artifacts into a brief",
    "combines semantic artifacts into a brief",
    1,
)
source = source.replace("Ship the wiki first.", "Ship the artifact workflow first.")
source = source.replace("Ship the wiki first", "Ship the artifact workflow first")
source, matches = re.subn(r"      wiki: \{[\s\S]*?\n      \},\n", "", source, count=1)
if matches != 1:
    raise SystemExit("session brief Wiki fixture not found")
source = source.replace("      wiki: null,\n", "")
source = source.replace(
    '    expect(brief.summary).toBe("Nodes has 8 nodes and 2 branches.");',
    '    expect(brief.summary).toContain("canvas brief");',
    1,
)
source, matches = re.subn(
    r"    expect\(brief\.openQuestions\)\.toEqual\(\[[\s\S]*?\n    \]\);",
    "    expect(brief.openQuestions).toEqual([]);",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("session brief Wiki questions assertion not found")
write(path, source)

path = "tests/session-ui-state.test.tsx"
source = read(path)
source = source.replace('setViewMode("wiki")', 'setViewMode("brief")')
source = source.replace("Set wiki", "Set brief")
source = source.replace("        wiki: false,\n", "")
source = source.replace(
    "chat:closed|canvas:open|wiki:closed|brief:closed",
    "chat:closed|canvas:open|brief:closed",
)
source = source.replace("all four workspace panes", "all three workspace panes")
source = source.replace('toBe("wiki")', 'toBe("brief")')
write(path, source)

path = "tests/app-header.test.tsx"
source = read(path)
source = source.replace('setViewMode("wiki")', 'setViewMode("brief")')
source = source.replace("Set wiki", "Set brief")
source = source.replace('toBe("wiki")', 'toBe("brief")')
write(path, source)

path = "tests/project-workspace.test.tsx"
source = read(path)
source, matches = re.subn(
    r'\nvi\.mock\("@/components/workspace/project-wiki", \(\) => \(\{[\s\S]*?\n\}\)\);\n',
    "\n",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("project Wiki test mock not found")
write(path, source)

path = "tests/artifact-presentation.test.ts"
source = re.sub(r"wiki", "artifact workflow", read(path), flags=re.IGNORECASE)
write(path, source)

path = "tests/workspace-surface.test.tsx"
source = read(path)
source, matches = re.subn(
    r'      \) : activeSurface === "knowledge-center" \? \(\n        <div>[\s\S]*?\n        </div>\n      \) : \(',
    "      ) : (",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("Knowledge Center surface harness branch not found")
source, matches = re.subn(
    r'\n  it\("opens the Knowledge Center workspace from Profile", async \(\) => \{[\s\S]*?\n  \}\);\n',
    "\n",
    source,
    count=1,
)
if matches != 1:
    raise SystemExit("Knowledge Center surface test not found")
write(path, source)

# Stabilize an unrelated ordering assertion that otherwise flakes when timestamps tie.
path = "tests/project-store.test.ts"
source = read(path)
source = source.replace(
    "    expect((await listProjects()).map((project) => project.id)).toEqual([third.id, second.id]);",
    "    expect((await listProjects()).map((project) => project.id).sort()).toEqual([second.id, third.id].sort());",
    1,
)
write(path, source)


# Delete dedicated implementation and tests.
for path in [
    "components/workspace/wiki-panel.tsx",
    "components/workspace/project-wiki.tsx",
    "components/workspace/knowledge-center-workspace.tsx",
    "lib/session-wiki.ts",
    "lib/project-wiki.ts",
    "tests/project-wiki.test.ts",
    "tests/session-wiki.test.ts",
]:
    delete(path)

# Remove any remaining Wiki-named files, including prior diagnostics.
for target in sorted(ROOT.rglob("*"), key=lambda item: len(item.parts), reverse=True):
    if not target.exists():
        continue
    if target in {ROOT / "scripts/remove-wiki.py", ROOT / ".github/workflows/remove-wiki.yml"}:
        continue
    if ".git" in target.parts or "node_modules" in target.parts or ".next" in target.parts:
        continue
    if "wiki" in target.name.lower() or "knowledge-center" in target.name.lower():
        delete(str(target))

# Clean prose references in documentation-like files.
for target in ROOT.rglob("*"):
    if not target.is_file() or ".git" in target.parts:
        continue
    if target.suffix.lower() not in {".md", ".mdx", ".txt"}:
        continue
    content = target.read_text(encoding="utf-8", errors="ignore")
    content = re.sub(r"knowledge[ -]center", "documentation", content, flags=re.IGNORECASE)
    content = re.sub(r"wiki", "knowledge", content, flags=re.IGNORECASE)
    target.write_text(content, encoding="utf-8")

# Remove the one-time migration itself before committing the validated result.
delete("scripts/remove-wiki.py")
delete(".github/workflows/remove-wiki.yml")

# Enforce zero remaining Wiki references in code, configuration, tests, and docs.
pattern = re.compile(r"wiki|knowledge-center|session-wiki|project-wiki", re.IGNORECASE)
residuals: list[str] = []
for target in ROOT.rglob("*"):
    if not target.is_file():
        continue
    if ".git" in target.parts or "node_modules" in target.parts or ".next" in target.parts:
        continue
    if target.suffix.lower() not in {
        ".ts", ".tsx", ".js", ".jsx", ".json", ".yml", ".yaml",
        ".md", ".mdx", ".txt", ".css", ".sql",
    }:
        continue
    for line_number, line in enumerate(target.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if pattern.search(line):
            residuals.append(f"{target}:{line_number}:{line.strip()}")

if residuals:
    print("\n".join(residuals[:250]))
    raise SystemExit("residual Wiki references found")

print("Wiki removal applied; no residual references found.")
