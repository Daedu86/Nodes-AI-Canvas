from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW_PATH = ROOT / "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx"
HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-branch-submission.ts"
TEST_PATH = ROOT / "tests/canvas-branch-submission.test.ts"


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


text = FLOW_PATH.read_text(encoding="utf-8")

text = replace_once(
    text,
    '  CANVAS_BRANCH_CANCEL_FAILURE,\n',
    '',
    'unused branch cancellation constant import',
)
text = replace_once(
    text,
    'import { executeBranchSpec } from "@/lib/thread-branching-runtime";\n',
    '',
    'branch runtime import',
)
text = replace_once(
    text,
    'import { ensureThreadIdle } from "@/lib/thread-run-control";\n',
    '',
    'thread idle import',
)
text = replace_once(
    text,
    'import { toLlmContextArtifacts } from "@/lib/session-artifacts";\n',
    '',
    'LLM context artifacts import',
)

anchor = 'import { useCanvasBlockActions } from "@/components/assistant-ui/thread-graph-flow/use-canvas-block-actions";\n'
text = replace_once(
    text,
    anchor,
    anchor
    + 'import { useCanvasBranchSubmission } from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";\n',
    'canvas block actions import',
)

text = replace_once(
    text,
    '  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);\n'
    '  const [canvasDraftError, setCanvasDraftError] = React.useState<string | null>(null);\n',
    '',
    'branch submission state',
)

refs_start = text.find('  const pendingDraftSubmissionRef = React.useRef(false);\n')
refs_end_marker = '  const requestErrorRef = React.useRef<string | null>(requestError);\n'
refs_end = text.find(refs_end_marker, refs_start)
if refs_start < 0 or refs_end < 0:
    fail('Could not locate branch submission refs.')
refs_end += len(refs_end_marker)
text = text[:refs_start] + text[refs_end:]

text = replace_once(
    text,
    '  React.useEffect(() => {\n'
    '    requestErrorRef.current = requestError;\n'
    '  }, [requestError]);\n\n',
    '',
    'request error ref effect',
)
text = replace_once(
    text,
    '  React.useEffect(() => {\n'
    '    canvasConversationNodesRef.current = canvasConversationNodes;\n'
    '  }, [canvasConversationNodes]);\n',
    '',
    'conversation nodes ref effect',
)

handlers_start = text.find('  const handleCancelRun = React.useCallback(() => {\n')
handlers_end_marker = '  }, [applyCompletedResponse, cancelDraft, runtime.threads.main]);\n'
handlers_end = text.find(handlers_end_marker, handlers_start)
if handlers_start < 0 or handlers_end < 0:
    fail('Could not locate canvas branch submission handlers.')
handlers_end += len(handlers_end_marker)

hook_usage = '''  const {
    canvasDraftError,
    handleCancelPromptDraft,
    handleCancelRun,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    setCanvasDraftError,
  } = useCanvasBranchSubmission({
    applyCompletedResponse,
    artifactIndex,
    cancelDraft,
    canvasConversationNodes,
    clearRequestError,
    draft,
    draftBranchSpec,
    draftContextArtifacts,
    historyMode,
    llmEnabled,
    modelId,
    provider,
    requestError,
    runtime,
    setRequestError,
  });
'''
text = text[:handlers_start] + hook_usage + text[handlers_end:]

text = replace_once(
    text,
    '    [beginDraft, clearRequestError, selectedMessageNode, setFlowRenderMode],\n',
    '    [\n'
    '      beginDraft,\n'
    '      clearRequestError,\n'
    '      selectedMessageNode,\n'
    '      setCanvasDraftError,\n'
    '      setFlowRenderMode,\n'
    '    ],\n',
    'branch operation callback dependencies',
)

FLOW_PATH.write_text(text, encoding="utf-8")

write_new(
    HOOK_PATH,
    '''"use client";\n\nimport { useAssistantRuntime } from "@assistant-ui/react";\nimport React from "react";\nimport type { GraphBranchIntent } from "@/components/context/graph-branch-intent";\nimport type { HistoryMode } from "@/components/context/history-mode";\nimport type { ModelProvider } from "@/components/context/model-config";\nimport {\n  CANVAS_BRANCH_CANCEL_FAILURE,\n  CANVAS_PROMPT_DRAFT_NODE_ID,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";\nimport { buildBranchSpec } from "@/lib/thread-branching";\nimport { executeBranchSpec } from "@/lib/thread-branching-runtime";\nimport { ensureThreadIdle } from "@/lib/thread-run-control";\nimport { toLlmContextArtifacts, type SessionArtifact } from "@/lib/session-artifacts";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\n\ntype AssistantRuntime = ReturnType<typeof useAssistantRuntime>;\ntype BranchSpec = ReturnType<typeof buildBranchSpec>;\n\ntype CompletedResponseInput = {\n  promptId: string;\n  responseId: string;\n  sourcePromptId?: string | null;\n  text: string;\n  artifactIds?: string[];\n};\n\ntype UseCanvasBranchSubmissionOptions = {\n  applyCompletedResponse: (input: CompletedResponseInput) => unknown;\n  artifactIndex: ReadonlyMap<string, SessionArtifact>;\n  cancelDraft: () => void;\n  canvasConversationNodes: ThreadGraphNodeModel[];\n  clearRequestError: () => void;\n  draft: GraphBranchIntent | null;\n  draftBranchSpec: BranchSpec | null;\n  draftContextArtifacts: SessionArtifact[];\n  historyMode: HistoryMode;\n  llmEnabled: boolean;\n  modelId: string;\n  provider: ModelProvider;\n  requestError: string | null;\n  runtime: AssistantRuntime;\n  setRequestError: (value: string | null) => void;\n};\n\ntype PendingOutputRun = {\n  beforeNodeIds: Set<string>;\n  sourcePromptId: string;\n  artifactIds: string[];\n};\n\nexport function findCompletedCanvasRunNodes(\n  currentNodes: ThreadGraphNodeModel[],\n  beforeNodeIds: ReadonlySet<string>,\n) {\n  const newNodes = currentNodes.filter((node) => !beforeNodeIds.has(node.id));\n  const responseNode = [...newNodes]\n    .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))\n    .find((node) => node.role === "assistant");\n  const promptNode = responseNode?.parentId\n    ? currentNodes.find((node) => node.id === responseNode.parentId) ?? null\n    : [...newNodes]\n        .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))\n        .find((node) => node.role === "user") ?? null;\n\n  return { promptNode, responseNode: responseNode ?? null };\n}\n\nexport function useCanvasBranchSubmission({\n  applyCompletedResponse,\n  artifactIndex,\n  cancelDraft,\n  canvasConversationNodes,\n  clearRequestError,\n  draft,\n  draftBranchSpec,\n  draftContextArtifacts,\n  historyMode,\n  llmEnabled,\n  modelId,\n  provider,\n  requestError,\n  runtime,\n  setRequestError,\n}: UseCanvasBranchSubmissionOptions) {\n  const [isSubmittingBranch, setIsSubmittingBranch] = React.useState(false);\n  const [canvasDraftError, setCanvasDraftError] = React.useState<string | null>(null);\n  const pendingDraftSubmissionRef = React.useRef(false);\n  const pendingOutputRunRef = React.useRef<PendingOutputRun | null>(null);\n  const canvasConversationNodesRef = React.useRef<ThreadGraphNodeModel[]>(\n    canvasConversationNodes,\n  );\n  const requestErrorRef = React.useRef<string | null>(requestError);\n\n  React.useEffect(() => {\n    canvasConversationNodesRef.current = canvasConversationNodes;\n  }, [canvasConversationNodes]);\n\n  React.useEffect(() => {\n    requestErrorRef.current = requestError;\n  }, [requestError]);\n\n  const handleCancelRun = React.useCallback(() => {\n    clearRequestError();\n    setCanvasDraftError(null);\n    pendingDraftSubmissionRef.current = false;\n    setIsSubmittingBranch(false);\n    try {\n      runtime.threads.main.cancelRun();\n    } catch {\n      const message = "Unable to cancel the current run.";\n      setCanvasDraftError(message);\n      setRequestError(message);\n    }\n  }, [clearRequestError, runtime.threads.main, setRequestError]);\n\n  const handleCancelPromptDraft = React.useCallback(() => {\n    pendingDraftSubmissionRef.current = false;\n    setIsSubmittingBranch(false);\n    setCanvasDraftError(null);\n    clearRequestError();\n    cancelDraft();\n  }, [cancelDraft, clearRequestError]);\n\n  const handleSubmitBranchDraft = React.useCallback(() => {\n    if (!draftBranchSpec || !draft || !llmEnabled) return;\n    const activeDraft = draft;\n\n    void (async () => {\n      let submitted = false;\n      try {\n        setIsSubmittingBranch(true);\n        setCanvasDraftError(null);\n        clearRequestError();\n\n        const threadReady = await ensureThreadIdle(runtime.threads.main);\n        if (!threadReady) {\n          pendingDraftSubmissionRef.current = false;\n          setCanvasDraftError(CANVAS_BRANCH_CANCEL_FAILURE);\n          setRequestError(CANVAS_BRANCH_CANCEL_FAILURE);\n          return;\n        }\n\n        pendingDraftSubmissionRef.current = true;\n        pendingOutputRunRef.current = {\n          beforeNodeIds: new Set(canvasConversationNodesRef.current.map((node) => node.id)),\n          sourcePromptId: CANVAS_PROMPT_DRAFT_NODE_ID,\n          artifactIds: [...activeDraft.outputArtifactIds],\n        };\n        const executed = executeBranchSpec(runtime.threads.main, draftBranchSpec, {\n          contextArtifacts:\n            draftContextArtifacts.length > 0\n              ? toLlmContextArtifacts(draftContextArtifacts)\n              : undefined,\n          contextNodeIds:\n            draftContextArtifacts.length > 0\n              ? draftContextArtifacts.map((artifact) => artifact.id)\n              : undefined,\n          historyMode,\n          inputArtifactIds: activeDraft.inputArtifactIds,\n          modelId,\n          outputArtifactIds: activeDraft.outputArtifactIds,\n          outputArtifactTypes: activeDraft.outputArtifactIds.map(\n            (artifactId) => artifactIndex.get(artifactId)?.semanticType ?? null,\n          ),\n          provider,\n          text: activeDraft.text,\n        });\n        if (!executed) {\n          pendingDraftSubmissionRef.current = false;\n          pendingOutputRunRef.current = null;\n          const message = "Branch draft is empty. Add a prompt before creating the branch.";\n          setCanvasDraftError(message);\n          setRequestError(message);\n          return;\n        }\n        submitted = true;\n      } catch {\n        pendingDraftSubmissionRef.current = false;\n        pendingOutputRunRef.current = null;\n        const message = "Canvas branching failed. Try again from the selected node.";\n        setCanvasDraftError(message);\n        setRequestError(message);\n      } finally {\n        if (!submitted) {\n          setIsSubmittingBranch(false);\n        }\n      }\n    })();\n  }, [\n    artifactIndex,\n    clearRequestError,\n    draft,\n    draftBranchSpec,\n    draftContextArtifacts,\n    historyMode,\n    llmEnabled,\n    modelId,\n    provider,\n    runtime.threads.main,\n    setRequestError,\n  ]);\n\n  React.useEffect(() => {\n    if (!requestError || !draft) return;\n    setCanvasDraftError(requestError);\n    if (pendingDraftSubmissionRef.current) {\n      pendingDraftSubmissionRef.current = false;\n      setIsSubmittingBranch(false);\n    }\n  }, [draft, requestError]);\n\n  React.useEffect(() => {\n    const unsubscribe = runtime.threads.main.unstable_on("runEnd", () => {\n      const pendingOutput = pendingOutputRunRef.current;\n      const resolveCompletedRun = (attempt: number) => {\n        const currentNodes = canvasConversationNodesRef.current;\n        const { promptNode, responseNode } = pendingOutput\n          ? findCompletedCanvasRunNodes(currentNodes, pendingOutput.beforeNodeIds)\n          : { promptNode: null, responseNode: null };\n\n        if (pendingOutput && responseNode && promptNode) {\n          applyCompletedResponse({\n            promptId: promptNode.id,\n            responseId: responseNode.id,\n            sourcePromptId: pendingOutput.sourcePromptId,\n            artifactIds: pendingOutput.artifactIds,\n            text: responseNode.text,\n          });\n          pendingOutputRunRef.current = null;\n        } else if (pendingOutput && attempt < 12) {\n          window.setTimeout(() => resolveCompletedRun(attempt + 1), 75);\n          return;\n        } else {\n          pendingOutputRunRef.current = null;\n        }\n\n        if (!pendingDraftSubmissionRef.current) return;\n        if (requestErrorRef.current) {\n          pendingDraftSubmissionRef.current = false;\n          setIsSubmittingBranch(false);\n          return;\n        }\n        pendingDraftSubmissionRef.current = false;\n        setCanvasDraftError(null);\n        cancelDraft();\n        setIsSubmittingBranch(false);\n      };\n      window.setTimeout(() => resolveCompletedRun(0), 0);\n    });\n    return unsubscribe;\n  }, [applyCompletedResponse, cancelDraft, runtime.threads.main]);\n\n  return {\n    canvasDraftError,\n    handleCancelPromptDraft,\n    handleCancelRun,\n    handleSubmitBranchDraft,\n    isSubmittingBranch,\n    setCanvasDraftError,\n  };\n}\n''',
)

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { findCompletedCanvasRunNodes } from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\n\nconst node = (\n  id: string,\n  role: ThreadGraphNodeModel["role"],\n  idx: number,\n  parentId: string | null,\n): ThreadGraphNodeModel => ({\n  id,\n  parentId,\n  role,\n  text: id,\n  depth: parentId ? 1 : 0,\n  idx,\n  branchId: null,\n  isBridge: false,\n  model: null,\n  provider: null,\n});\n\ndescribe("findCompletedCanvasRunNodes", () => {\n  it("selects the latest assistant response and its prompt parent", () => {\n    const existing = node("existing", "assistant", 1, "root");\n    const prompt = node("prompt", "user", 2, "existing");\n    const response = node("response", "assistant", 3, "prompt");\n\n    expect(\n      findCompletedCanvasRunNodes(\n        [existing, prompt, response],\n        new Set(["existing"]),\n      ),\n    ).toEqual({ promptNode: prompt, responseNode: response });\n  });\n\n  it("returns null nodes while the completed response is not available", () => {\n    const existing = node("existing", "assistant", 1, "root");\n    expect(\n      findCompletedCanvasRunNodes([existing], new Set(["existing"])),\n    ).toEqual({ promptNode: null, responseNode: null });\n  });\n});\n''',
)

print("Canvas branch submission refactor prepared successfully.")
