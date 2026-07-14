from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW_PATH = ROOT / "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx"
HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-session-state.ts"
TEST_PATH = ROOT / "tests/canvas-session-state.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def remove_range(text: str, start_marker: str, end_marker: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        fail(f"Could not locate {label}.")
    end += len(end_marker)
    return text[:start] + text[end:]


def write_new(path: Path, content: str) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing file: {path.relative_to(ROOT)}")
    path.write_text(content, encoding="utf-8")


text = FLOW_PATH.read_text(encoding="utf-8")

text = replace_once(
    text,
    'import {\n  type ReactFlowInstance,\n  type Viewport,\n} from "@xyflow/react";\n',
    'import { type ReactFlowInstance } from "@xyflow/react";\n',
    'React Flow type imports',
)
text = replace_once(
    text,
    'import {\n  readFlowViewport,\n  writeFlowViewport,\n} from "@/components/assistant-ui/thread-graph/graph-storage";\n',
    '',
    'graph storage imports',
)
text = replace_once(text, '  isFlowViewport,\n', '', 'viewport guard import')
text = replace_once(text, '  readFlowRenderMode,\n', '', 'render mode reader import')
text = replace_once(text, '  type FlowDensityMode,\n', '', 'density mode type import')
text = replace_once(text, '  type FlowRenderMode,\n', '', 'render mode type import')
text = replace_once(text, '  type FlowSpotlightMode,\n', '', 'spotlight mode type import')

anchor = 'import { useCanvasBranchSubmission } from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";\n'
text = replace_once(
    text,
    anchor,
    anchor
    + 'import { useCanvasSessionState } from "@/components/assistant-ui/thread-graph-flow/use-canvas-session-state";\n',
    'canvas branch submission import',
)

state_start = '  const [linkEditMode, setLinkEditMode] = React.useState(false);\n'
state_end = '  const [flowRenderMode, setFlowRenderMode] = React.useState<FlowRenderMode>("2d");\n'
text = remove_range(text, state_start, state_end, 'session-bound canvas state')

mode_start = '  React.useEffect(() => {\n    setFlowRenderMode(readFlowRenderMode(flowRenderModeKey));\n  }, [flowRenderModeKey]);\n\n'
mode_end = '  const treeSignatureRef = React.useRef<string | null>(null);\n'
text = remove_range(text, mode_start, mode_end, 'render mode and viewport persistence state')

prompt_index = '''  const promptIndex = React.useMemo(
    () => new Map(canvasPrompts.map((prompt) => [prompt.id, prompt] as const)),
    [canvasPrompts],
  );
'''
hook_usage = prompt_index + '''  const {
    applyCanvasSelection,
    densityMode,
    flowRenderMode,
    linkEditMode,
    selectedNodeId,
    setDensityMode,
    setFlowRenderMode,
    setLinkEditMode,
    setSelectedNodeId,
    setSpotlight,
    setStoredViewport,
    setToolbarMenu,
    spotlight,
    storedViewport,
    toolbarMenu,
    treeSignatureRef,
  } = useCanvasSessionState({
    activeSessionId,
    artifactIndex,
    cancelDraft,
    canvasSelectionId,
    draft,
    focusedMessageId,
    nodeIndex,
    promptIndex,
    setCanvasSelectionId,
    setFocusedMessageId,
  });
'''
text = replace_once(text, prompt_index, hook_usage, 'prompt index declaration')

session_reset_start = '  React.useEffect(() => {\n    setStoredViewport(readFlowViewport(activeSessionId));\n'
session_reset_end = '  }, [activeSessionId, cancelDraft, setCanvasSelectionId]);\n\n'
text = remove_range(text, session_reset_start, session_reset_end, 'session reset effect')

draft_sync_start = '  React.useEffect(() => {\n    if (\n      draft &&\n      selectedNodeId &&\n'
viewport_end = '  }, [activeSessionId, storedViewport]);\n\n'
text = remove_range(text, draft_sync_start, viewport_end, 'draft selection and viewport effects')

selection_start = '  const applyCanvasSelection = React.useCallback(\n'
selection_end = '  }, [densityMode, selectedNodeId]);\n\n'
text = remove_range(text, selection_start, selection_end, 'canvas selection synchronization')

FLOW_PATH.write_text(text, encoding="utf-8")

write_new(
    HOOK_PATH,
    '''"use client";\n\nimport type { Viewport } from "@xyflow/react";\nimport React from "react";\nimport type { GraphBranchIntent } from "@/components/context/graph-branch-intent";\nimport {\n  readFlowViewport,\n  writeFlowViewport,\n} from "@/components/assistant-ui/thread-graph/graph-storage";\nimport {\n  CANVAS_PROMPT_DRAFT_NODE_ID,\n  isFlowViewport,\n  readFlowRenderMode,\n  type FlowDensityMode,\n  type FlowRenderMode,\n  type FlowSpotlightMode,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";\nimport {\n  ROOT_NODE_ID,\n  type Node as ThreadGraphNodeModel,\n} from "@/components/assistant-ui/thread-graph/graph-types";\nimport type { SessionArtifact } from "@/lib/session-artifacts";\n\ntype CanvasToolbarMenu = "add" | "tools" | null;\n\ntype UseCanvasSessionStateOptions = {\n  activeSessionId: string | null | undefined;\n  artifactIndex: ReadonlyMap<string, SessionArtifact>;\n  cancelDraft: () => void;\n  canvasSelectionId: string | null;\n  draft: GraphBranchIntent | null;\n  focusedMessageId: string | null;\n  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;\n  promptIndex: ReadonlyMap<string, SessionArtifact>;\n  setCanvasSelectionId: (value: string | null) => void;\n  setFocusedMessageId: (value: string | null) => void;\n};\n\ntype ResolveCanvasFocusedMessageIdOptions = {\n  nodeId: string | null;\n  hasArtifact: boolean;\n  hasConversationNode: boolean;\n  hasPrompt: boolean;\n};\n\nexport const getCanvasFlowRenderModeStorageKey = (\n  activeSessionId: string | null | undefined,\n) => `nodes.canvas.render-mode.v1:${activeSessionId ?? "unknown"}`;\n\nexport function resolveCanvasFocusedMessageId({\n  nodeId,\n  hasArtifact,\n  hasConversationNode,\n  hasPrompt,\n}: ResolveCanvasFocusedMessageIdOptions): string | null | undefined {\n  if (!nodeId || nodeId === ROOT_NODE_ID || nodeId === CANVAS_PROMPT_DRAFT_NODE_ID) {\n    return null;\n  }\n  if (hasArtifact || hasPrompt) return null;\n  if (hasConversationNode) return nodeId;\n  return undefined;\n}\n\nexport function useCanvasSessionState({\n  activeSessionId,\n  artifactIndex,\n  cancelDraft,\n  canvasSelectionId,\n  draft,\n  focusedMessageId,\n  nodeIndex,\n  promptIndex,\n  setCanvasSelectionId,\n  setFocusedMessageId,\n}: UseCanvasSessionStateOptions) {\n  const [linkEditMode, setLinkEditMode] = React.useState(false);\n  const [spotlight, setSpotlight] = React.useState<FlowSpotlightMode>("all");\n  const [densityMode, setDensityMode] = React.useState<FlowDensityMode>("overview");\n  const [toolbarMenu, setToolbarMenu] = React.useState<CanvasToolbarMenu>(null);\n  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);\n  const [flowRenderMode, setFlowRenderMode] = React.useState<FlowRenderMode>("2d");\n  const [storedViewport, setStoredViewport] = React.useState<Viewport | null>(() =>\n    readFlowViewport(activeSessionId),\n  );\n  const treeSignatureRef = React.useRef<string | null>(null);\n  const flowRenderModeKey = React.useMemo(\n    () => getCanvasFlowRenderModeStorageKey(activeSessionId),\n    [activeSessionId],\n  );\n\n  React.useEffect(() => {\n    setFlowRenderMode(readFlowRenderMode(flowRenderModeKey));\n  }, [flowRenderModeKey]);\n\n  React.useEffect(() => {\n    try {\n      localStorage.setItem(flowRenderModeKey, flowRenderMode);\n    } catch {\n      // ignore storage errors\n    }\n  }, [flowRenderMode, flowRenderModeKey]);\n\n  React.useEffect(() => {\n    setStoredViewport(readFlowViewport(activeSessionId));\n    setSelectedNodeId(null);\n    setCanvasSelectionId(null);\n    setLinkEditMode(false);\n    setToolbarMenu(null);\n    setSpotlight("all");\n    setDensityMode("overview");\n    treeSignatureRef.current = null;\n    cancelDraft();\n  }, [activeSessionId, cancelDraft, setCanvasSelectionId]);\n\n  React.useEffect(() => {\n    if (\n      draft &&\n      selectedNodeId &&\n      selectedNodeId !== CANVAS_PROMPT_DRAFT_NODE_ID &&\n      draft.anchorId !== selectedNodeId\n    ) {\n      cancelDraft();\n    }\n  }, [cancelDraft, draft, selectedNodeId]);\n\n  React.useEffect(() => {\n    if (isFlowViewport(storedViewport)) {\n      writeFlowViewport(storedViewport, activeSessionId);\n    }\n  }, [activeSessionId, storedViewport]);\n\n  const applyCanvasSelection = React.useCallback(\n    (nodeId: string | null) => {\n      setSelectedNodeId(nodeId);\n      setCanvasSelectionId(nodeId);\n      const nextFocusedMessageId = resolveCanvasFocusedMessageId({\n        nodeId,\n        hasArtifact: !!nodeId && artifactIndex.has(nodeId),\n        hasConversationNode: !!nodeId && nodeIndex.has(nodeId),\n        hasPrompt: !!nodeId && promptIndex.has(nodeId),\n      });\n      if (nextFocusedMessageId !== undefined) {\n        setFocusedMessageId(nextFocusedMessageId);\n      }\n    },\n    [artifactIndex, nodeIndex, promptIndex, setCanvasSelectionId, setFocusedMessageId],\n  );\n\n  React.useEffect(() => {\n    if (!focusedMessageId || focusedMessageId === selectedNodeId) return;\n    if (!nodeIndex.has(focusedMessageId)) return;\n    setSelectedNodeId(focusedMessageId);\n  }, [focusedMessageId, nodeIndex, selectedNodeId]);\n\n  React.useEffect(() => {\n    if (!canvasSelectionId || canvasSelectionId === selectedNodeId) return;\n    if (\n      !nodeIndex.has(canvasSelectionId) &&\n      !artifactIndex.has(canvasSelectionId) &&\n      !promptIndex.has(canvasSelectionId)\n    ) {\n      return;\n    }\n    applyCanvasSelection(canvasSelectionId);\n  }, [\n    applyCanvasSelection,\n    artifactIndex,\n    canvasSelectionId,\n    nodeIndex,\n    promptIndex,\n    selectedNodeId,\n  ]);\n\n  React.useEffect(() => {\n    if (densityMode === "focus" && !selectedNodeId) {\n      setDensityMode("overview");\n    }\n  }, [densityMode, selectedNodeId]);\n\n  return {\n    applyCanvasSelection,\n    densityMode,\n    flowRenderMode,\n    linkEditMode,\n    selectedNodeId,\n    setDensityMode,\n    setFlowRenderMode,\n    setLinkEditMode,\n    setSelectedNodeId,\n    setSpotlight,\n    setStoredViewport,\n    setToolbarMenu,\n    spotlight,\n    storedViewport,\n    toolbarMenu,\n    treeSignatureRef,\n  };\n}\n''',
)

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport {\n  getCanvasFlowRenderModeStorageKey,\n  resolveCanvasFocusedMessageId,\n} from "@/components/assistant-ui/thread-graph-flow/use-canvas-session-state";\n\ndescribe("canvas session state helpers", () => {\n  it("scopes the render mode key to the active session", () => {\n    expect(getCanvasFlowRenderModeStorageKey("session-42")).toBe(\n      "nodes.canvas.render-mode.v1:session-42",\n    );\n    expect(getCanvasFlowRenderModeStorageKey(null)).toBe(\n      "nodes.canvas.render-mode.v1:unknown",\n    );\n  });\n\n  it("focuses conversation nodes and clears focus for canvas-only nodes", () => {\n    expect(\n      resolveCanvasFocusedMessageId({\n        nodeId: "message-1",\n        hasArtifact: false,\n        hasConversationNode: true,\n        hasPrompt: false,\n      }),\n    ).toBe("message-1");\n    expect(\n      resolveCanvasFocusedMessageId({\n        nodeId: "artifact-1",\n        hasArtifact: true,\n        hasConversationNode: false,\n        hasPrompt: false,\n      }),\n    ).toBeNull();\n  });\n\n  it("preserves focused message state for unknown external selections", () => {\n    expect(\n      resolveCanvasFocusedMessageId({\n        nodeId: "unknown",\n        hasArtifact: false,\n        hasConversationNode: false,\n        hasPrompt: false,\n      }),\n    ).toBeUndefined();\n  });\n});\n''',
)

print("Canvas session state refactor prepared successfully.")
