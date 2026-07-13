from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_PATH = ROOT / "components/workspace/project-workspace.tsx"
STATE_PATH = ROOT / "components/workspace/use-project-workspace-state.ts"
UTILS_PATH = ROOT / "components/workspace/project-workspace-utils.ts"
SECTION_CARD_PATH = ROOT / "components/workspace/project-section-card.tsx"
TEST_PATH = ROOT / "tests/project-workspace-utils.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def write_new(path: Path, content: str) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing file: {path.relative_to(ROOT)}")
    path.write_text(content, encoding="utf-8")


text = WORKSPACE_PATH.read_text(encoding="utf-8")

text = replace_once(
    text,
    'type ArenaCompareMode = "sessions" | "branches";\ntype ProjectInspectorTab = "context" | "arena" | "nodes" | "sessions" | "focus";\n\n',
    "",
    "workspace type declaration block",
)

utilities_start = text.find("const PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD = 10;")
component_start = text.find("export function ProjectWorkspace() {")
if utilities_start < 0 or component_start < 0 or utilities_start >= component_start:
    fail("Could not locate the project workspace utility block.")
text = text[:utilities_start] + text[component_start:]

state_start = text.find("  const [selectedCanvasItem, setSelectedCanvasItem]")
member_sessions_start = text.find("  const memberSessions = React.useMemo<SessionDocument[]>(")
if state_start < 0 or member_sessions_start < 0 or state_start >= member_sessions_start:
    fail("Could not locate the project workspace state block.")

state_usage = """  const {
    arenaBranchKeys,
    arenaCompareMode,
    arenaSessionIds,
    contextSaveState,
    globalContextDraft,
    globalContextEditorRef,
    inspectorTab,
    memberActionMessage,
    memberActionState,
    memberEmailDraft,
    memberRoleDraft,
    memoryActionMessage,
    memoryActionState,
    memoryContentDraft,
    memoryTitleDraft,
    memoryTypeDraft,
    selectedCanvasItem,
    selectedContextSourceIds,
    setArenaBranchKeys,
    setArenaCompareMode,
    setArenaSessionIds,
    setContextSaveState,
    setGlobalContextDraft,
    setInspectorTab,
    setMemberActionMessage,
    setMemberActionState,
    setMemberEmailDraft,
    setMemberRoleDraft,
    setMemoryActionMessage,
    setMemoryActionState,
    setMemoryContentDraft,
    setMemoryTitleDraft,
    setMemoryTypeDraft,
    setSelectedCanvasItem,
    setSelectedContextSourceIds,
    setTitleDraft,
    setWorkspaceMode,
    shouldPreferArenaOnLoad,
    titleDraft,
    workspaceMode,
  } = useProjectWorkspaceState(activeProject);

"""
text = text[:state_start] + state_usage + text[member_sessions_start:]

text = text.replace("<SectionCard", "<ProjectSectionCard")
text = text.replace("</SectionCard>", "</ProjectSectionCard>")
if "SectionCard" in text:
    fail("Not all SectionCard references were migrated.")

# Remove imports that belonged only to the extracted utility/state blocks.
if text.count("ProjectDocument") == 1:
    text = text.replace('import type { ProjectDocument } from "@/lib/project-documents";\n', "")
if text.count("ProjectArenaBranchEntry") == 1:
    text = text.replace("  type ProjectArenaBranchEntry,\n", "")
if text.count("ProjectCanvasSelection") == 1:
    text = text.replace(
        'import { ProjectCanvas, type ProjectCanvasSelection } from "@/components/workspace/project-canvas";',
        'import { ProjectCanvas } from "@/components/workspace/project-canvas";',
    )
if text.count("ProjectCollaboratorRole") == 1:
    text = text.replace(
        'import type { ProjectCollaboratorRole } from "@/lib/project-documents";\n',
        "",
    )

state_import_names = ["useProjectWorkspaceState"]
for identifier in ("ArenaCompareMode", "ProjectInspectorTab"):
    if identifier in text:
        state_import_names.append(f"type {identifier}")

state_import = (
    'import {\n  '
    + ",\n  ".join(state_import_names)
    + ',\n} from "@/components/workspace/use-project-workspace-state";\n'
)

utility_identifiers = [
    "formatMemoryTitle",
    "formatProjectTitle",
    "formatProjectWinnerLabel",
    "formatSessionTitle",
    "formatUpdatedAt",
    "summarizePreviewText",
    "summarizeSelectionForTypedNode",
]
used_utilities = [identifier for identifier in utility_identifiers if identifier in text]
if not used_utilities:
    fail("No extracted utility usages remained in ProjectWorkspace.")
utils_import = (
    'import {\n  '
    + ",\n  ".join(used_utilities)
    + ',\n} from "@/components/workspace/project-workspace-utils";\n'
)

anchor = 'import { ProjectArena } from "@/components/workspace/project-arena";\n'
imports = (
    anchor
    + 'import { ProjectSectionCard } from "@/components/workspace/project-section-card";\n'
    + utils_import
    + state_import
)
text = replace_once(text, anchor, imports, "ProjectArena import")
WORKSPACE_PATH.write_text(text, encoding="utf-8")

write_new(
    STATE_PATH,
    '''"use client";\n\nimport React from "react";\nimport type { ProjectCanvasSelection } from "@/components/workspace/project-canvas";\nimport type { ProjectCollaboratorRole, ProjectDocument } from "@/lib/project-documents";\nimport type { ProjectMemoryType } from "@/lib/memory-documents";\n\nexport type ArenaCompareMode = "sessions" | "branches";\nexport type ProjectInspectorTab = "context" | "arena" | "nodes" | "sessions" | "focus";\ntype ActionState = "idle" | "saving" | "saved" | "error";\ntype WorkspaceMode = "canvas" | "arena";\n\nconst PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD = 10;\n\nexport function useProjectWorkspaceState(activeProject: ProjectDocument | null) {\n  const [selectedCanvasItem, setSelectedCanvasItem] =\n    React.useState<ProjectCanvasSelection>(null);\n  const globalContextEditorRef = React.useRef<HTMLTextAreaElement | null>(null);\n  const [titleDraft, setTitleDraft] = React.useState(activeProject?.title ?? "");\n  const [globalContextDraft, setGlobalContextDraft] = React.useState(\n    activeProject?.globalContext ?? "",\n  );\n  const [contextSaveState, setContextSaveState] = React.useState<ActionState>("idle");\n  const [workspaceMode, setWorkspaceMode] = React.useState<WorkspaceMode>(() =>\n    (activeProject?.sessionIds.length ?? 0) >= PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD\n      ? "arena"\n      : "canvas",\n  );\n  const [arenaCompareMode, setArenaCompareMode] =\n    React.useState<ArenaCompareMode>("sessions");\n  const [arenaSessionIds, setArenaSessionIds] = React.useState<string[]>([]);\n  const [arenaBranchKeys, setArenaBranchKeys] = React.useState<string[]>([]);\n  const [memoryTitleDraft, setMemoryTitleDraft] = React.useState("Arena synthesis");\n  const [memoryTypeDraft, setMemoryTypeDraft] =\n    React.useState<ProjectMemoryType>("summary");\n  const [memoryContentDraft, setMemoryContentDraft] = React.useState("");\n  const [memoryActionState, setMemoryActionState] = React.useState<ActionState>("idle");\n  const [memoryActionMessage, setMemoryActionMessage] = React.useState(\n    "Create a typed node and attach it to this project.",\n  );\n  const [selectedContextSourceIds, setSelectedContextSourceIds] =\n    React.useState<string[]>([]);\n  const [inspectorTab, setInspectorTab] =\n    React.useState<ProjectInspectorTab>("context");\n  const [memberEmailDraft, setMemberEmailDraft] = React.useState("");\n  const [memberRoleDraft, setMemberRoleDraft] =\n    React.useState<ProjectCollaboratorRole>("viewer");\n  const [memberActionState, setMemberActionState] = React.useState<ActionState>("idle");\n  const [memberActionMessage, setMemberActionMessage] = React.useState(\n    "Share this project with editors or viewers.",\n  );\n\n  const shouldPreferArenaOnLoad = React.useMemo(\n    () =>\n      (activeProject?.sessionIds.length ?? 0) >=\n      PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD,\n    [activeProject?.sessionIds.length],\n  );\n\n  React.useEffect(() => {\n    setTitleDraft(activeProject?.title ?? "");\n    setGlobalContextDraft(activeProject?.globalContext ?? "");\n    setSelectedCanvasItem(null);\n    setContextSaveState("idle");\n    setMemoryActionState("idle");\n    setMemoryTitleDraft("Arena synthesis");\n    setMemoryTypeDraft("summary");\n    setMemoryContentDraft("");\n    setMemoryActionMessage("Create a typed node and attach it to this project.");\n    setMemberEmailDraft("");\n    setMemberRoleDraft("viewer");\n    setMemberActionState("idle");\n    setMemberActionMessage("Share this project with editors or viewers.");\n    setWorkspaceMode(\n      (activeProject?.sessionIds.length ?? 0) >=\n        PROJECT_CANVAS_AUTOSTART_SESSION_THRESHOLD\n        ? "arena"\n        : "canvas",\n    );\n    setArenaCompareMode("sessions");\n    setArenaSessionIds([]);\n    setArenaBranchKeys([]);\n    setSelectedContextSourceIds([]);\n    setInspectorTab("context");\n  }, [\n    activeProject?.globalContext,\n    activeProject?.id,\n    activeProject?.sessionIds.length,\n    activeProject?.title,\n  ]);\n\n  return {\n    arenaBranchKeys,\n    arenaCompareMode,\n    arenaSessionIds,\n    contextSaveState,\n    globalContextDraft,\n    globalContextEditorRef,\n    inspectorTab,\n    memberActionMessage,\n    memberActionState,\n    memberEmailDraft,\n    memberRoleDraft,\n    memoryActionMessage,\n    memoryActionState,\n    memoryContentDraft,\n    memoryTitleDraft,\n    memoryTypeDraft,\n    selectedCanvasItem,\n    selectedContextSourceIds,\n    setArenaBranchKeys,\n    setArenaCompareMode,\n    setArenaSessionIds,\n    setContextSaveState,\n    setGlobalContextDraft,\n    setInspectorTab,\n    setMemberActionMessage,\n    setMemberActionState,\n    setMemberEmailDraft,\n    setMemberRoleDraft,\n    setMemoryActionMessage,\n    setMemoryActionState,\n    setMemoryContentDraft,\n    setMemoryTitleDraft,\n    setMemoryTypeDraft,\n    setSelectedCanvasItem,\n    setSelectedContextSourceIds,\n    setTitleDraft,\n    setWorkspaceMode,\n    shouldPreferArenaOnLoad,\n    titleDraft,\n    workspaceMode,\n  };\n}\n''',
)

write_new(
    UTILS_PATH,
    '''import type { ProjectCanvasSelection } from "@/components/workspace/project-canvas";\nimport type { ProjectArenaBranchEntry } from "@/lib/project-arena";\nimport type { ProjectDocument } from "@/lib/project-documents";\nimport type { SessionDocument } from "@/lib/session-documents";\n\nexport const formatProjectTitle = (title: string | null) =>\n  title?.trim() || "Untitled Project";\n\nexport const formatSessionTitle = (title: string | null) =>\n  title?.trim() || "Untitled Session";\n\nexport const formatMemoryTitle = (title: string) =>\n  title.trim() || "Untitled Memory";\n\nexport const formatProjectWinnerLabel = ({\n  branchCatalog,\n  memberSessions,\n  project,\n}: {\n  branchCatalog: ProjectArenaBranchEntry[];\n  memberSessions: SessionDocument[];\n  project: ProjectDocument;\n}) => {\n  if (project.arenaWinnerBranchKey) {\n    return (\n      branchCatalog.find((entry) => entry.key === project.arenaWinnerBranchKey)?.title ??\n      "Branch winner"\n    );\n  }\n  if (project.arenaWinnerSessionId) {\n    return (\n      memberSessions\n        .find((session) => session.id === project.arenaWinnerSessionId)\n        ?.title?.trim() || "Session winner"\n    );\n  }\n  return "Not set";\n};\n\nexport const formatUpdatedAt = (value: string) => {\n  try {\n    return new Intl.DateTimeFormat(undefined, {\n      dateStyle: "medium",\n      timeStyle: "short",\n    }).format(new Date(value));\n  } catch {\n    return value;\n  }\n};\n\nexport const summarizePreviewText = (value: string, maxLength = 220) => {\n  const compact = value.replace(/\\s+/g, " ").trim();\n  if (!compact) return "";\n  if (compact.length <= maxLength) return compact;\n  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;\n};\n\nexport const summarizeSelectionForTypedNode = (\n  selection: ProjectCanvasSelection,\n) => {\n  if (!selection) return "";\n  const prefix =\n    selection.kind === "edge"\n      ? `Canvas branch: ${selection.label}`\n      : `Canvas focus: ${selection.label}`;\n  return `${prefix}\\n\\n${selection.preview}`.trim();\n};\n''',
)

write_new(
    SECTION_CARD_PATH,
    '''import type { ReactNode } from "react";\n\ntype ProjectSectionCardProps = {\n  title: string;\n  description?: string;\n  children: ReactNode;\n};\n\nexport function ProjectSectionCard({\n  title,\n  description,\n  children,\n}: ProjectSectionCardProps) {\n  return (\n    <section className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 shadow-sm">\n      <div className="space-y-1">\n        <h3 className="text-sm font-semibold text-foreground">{title}</h3>\n        {description ? (\n          <p className="text-xs text-muted-foreground">{description}</p>\n        ) : null}\n      </div>\n      <div className="mt-3">{children}</div>\n    </section>\n  );\n}\n''',
)

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport {\n  formatMemoryTitle,\n  formatProjectTitle,\n  formatSessionTitle,\n  summarizePreviewText,\n} from "@/components/workspace/project-workspace-utils";\n\ndescribe("project workspace utilities", () => {\n  it("provides stable fallback titles", () => {\n    expect(formatProjectTitle(null)).toBe("Untitled Project");\n    expect(formatSessionTitle("   ")).toBe("Untitled Session");\n    expect(formatMemoryTitle("  ")).toBe("Untitled Memory");\n  });\n\n  it("normalizes and truncates preview text", () => {\n    expect(summarizePreviewText("  one\\n  two  ")).toBe("one two");\n    expect(summarizePreviewText("abcdefghij", 8)).toBe("abcde...");\n  });\n});\n''',
)

print("ProjectWorkspace refactor prepared successfully.")
