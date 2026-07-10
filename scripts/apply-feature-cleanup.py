from pathlib import Path


def replace_required(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    source = target.read_text(encoding="utf-8")
    if old not in source:
        raise SystemExit(f"Missing expected text for {label} in {path}")
    target.write_text(source.replace(old, new), encoding="utf-8")


replace_required(
    "components/workspace/wiki-panel.tsx",
    'import { Button } from "@/components/ui/button";\n',
    "",
    "Wiki Brief button import",
)
replace_required(
    "components/workspace/wiki-panel.tsx",
    'import { useSessionUiState } from "@/components/context/session-ui-state";\n',
    "",
    "Wiki Brief navigation state import",
)
replace_required(
    "components/workspace/wiki-panel.tsx",
    '  const { setViewMode } = useSessionUiState();\n\n',
    "",
    "Wiki Brief navigation state",
)
replace_required(
    "components/workspace/wiki-panel.tsx",
    '''          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("brief")}>
              Brief
            </Button>
          </div>
''',
    "",
    "Wiki Brief navigation button",
)

knowledge_path = Path("components/workspace/knowledge-center-workspace.tsx")
knowledge = knowledge_path.read_text(encoding="utf-8")
replacements = [
    (
        "Nodes is a decision workspace. You explore in chat, structure in canvas, stabilize in wiki, and then produce a brief. The core idea is that exploration should remain inspectable and reusable, not flattened into a single transcript.",
        "Nodes is a decision workspace. You explore in chat, structure in canvas, and stabilize durable knowledge in wiki. The core idea is that exploration should remain inspectable and reusable, not flattened into a single transcript.",
    ),
    ('          "Brief as the current answer snapshot.",\n', ""),
    ('          "5. Use Brief for the final summary.",\n', ""),
    (
        '''      {
        id: "brief",
        title: "Brief",
        body:
          "Brief is the canonical output snapshot: recommendation, evidence, risks, and next steps. It should be the thing you can share or paste into a doc.",
      },
''',
        "",
    ),
    (
        "Sessions are the working units. Projects group sessions and consolidate the wiki and brief into longer-lived context.",
        "Sessions are the working units. Projects group sessions and consolidate wiki knowledge and reusable artifacts into longer-lived context.",
    ),
    (
        '''      {
        id: "why-brief",
        title: "Why a Brief?",
        body:
          "Because you need a canonical output. Brief is the product’s landing format for decisions and next steps.",
      },
''',
        "",
    ),
    (
        '                  <div className="grid gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))]">',
        '                  <div className="grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))]">',
    ),
    ('                      ["Brief", "Land on the current recommendation."],\n', ""),
]
for old, new in replacements:
    if old not in knowledge:
        raise SystemExit(f"Missing expected Knowledge Center text: {old[:80]!r}")
    knowledge = knowledge.replace(old, new)
knowledge_path.write_text(knowledge, encoding="utf-8")

replace_required(
    "components/assistant-ui/thread-graph-flow/artifact-presentation.ts",
    'return "Reusable brief";',
    'return "Reusable context";',
    "artifact readable role",
)
replace_required(
    "tests/artifact-presentation.test.ts",
    'title: "Decision Brief",',
    'title: "Decision Context",',
    "artifact fixture title",
)
