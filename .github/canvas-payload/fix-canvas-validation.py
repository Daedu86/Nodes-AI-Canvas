from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"missing fix anchor: {label}")
    path.write_text(text.replace(old, new, 1))
    print("fixed", label)


flow = Path("components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx")
replace_once(
    flow,
    "const getSemanticArtifactMeta = (semanticType?: SessionArtifactSemanticType | null) =>\n"
    "  semanticType ? semanticArtifactMeta[semanticType] : null;",
    "const getSemanticArtifactMeta = (semanticType?: SessionArtifactSemanticType | null) =>\n"
    "  semanticType ? semanticArtifactMeta[semanticType] : null;\n\n"
    "const semanticArtifactPresets = (\n"
    "  Object.keys(semanticArtifactMeta) as SessionArtifactSemanticType[]\n"
    ").map((semanticType) => ({ semanticType }));",
    "semantic artifact inspector options",
)
replace_once(
    flow,
    "  const handleSubmitBranchDraft = React.useCallback(() => {\n"
    "    if (!draftBranchSpec || !draft || !llmEnabled) return;\n\n"
    "    void (async () => {",
    "  const handleSubmitBranchDraft = React.useCallback(() => {\n"
    "    if (!draftBranchSpec || !draft || !llmEnabled) return;\n"
    "    const activeDraft = draft;\n\n"
    "    void (async () => {",
    "capture non-null draft",
)
for old, new, label in [
    ("artifactIds: [...draft.outputArtifactIds],", "artifactIds: [...activeDraft.outputArtifactIds],", "pending output ids"),
    ("inputArtifactIds: draft.inputArtifactIds,", "inputArtifactIds: activeDraft.inputArtifactIds,", "runtime input ids"),
    ("outputArtifactIds: draft.outputArtifactIds,", "outputArtifactIds: activeDraft.outputArtifactIds,", "runtime output ids"),
    ("outputArtifactTypes: draft.outputArtifactIds.map(", "outputArtifactTypes: activeDraft.outputArtifactIds.map(", "runtime output types"),
    ("text: draft.text,", "text: activeDraft.text,", "runtime draft text"),
    ("onClick={handleCreatePromptNode}", "onClick={() => handleCreatePromptNode()}", "prompt CTA click handler"),
]:
    replace_once(flow, old, new, label)

provider = Path("components/context/session-artifacts.tsx")
replace_once(
    provider,
    "sourcePromptId: input.sourcePromptId ?? null,",
    "sourcePromptId: input.sourcePromptId ?? undefined,",
    "completed response source prompt",
)

project_arena = Path("lib/project-arena.ts")
replace_once(
    project_arena,
    ".filter((link) => subtreeIds.has(link.targetMessageId))",
    ".filter((link) => Boolean(link.targetMessageId && subtreeIds.has(link.targetMessageId)))",
    "optional context link target",
)

prompt_node = Path("components/assistant-ui/thread-graph-flow/canvas-prompt-node.tsx")
replace_once(prompt_node, "                 Prompt\n", "                 Draft prompt\n", "prompt badge label")
replace_once(
    prompt_node,
    '<Trash2 className="mr-1.5 h-4 w-4" /> Delete',
    '<Trash2 className="mr-1.5 h-4 w-4" /> Delete draft',
    "prompt delete label",
)
replace_once(
    prompt_node,
    'aria-label="Run prompt block"',
    'aria-label="Send prompt node"',
    "prompt submit accessible label",
)
