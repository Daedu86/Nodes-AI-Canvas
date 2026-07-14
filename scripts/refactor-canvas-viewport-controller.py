from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW_PATH = ROOT / "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx"
SESSION_HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-session-state.ts"
VIEWPORT_HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller.ts"
TEST_PATH = ROOT / "tests/canvas-viewport-controller.test.ts"


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


flow = FLOW_PATH.read_text(encoding="utf-8")
flow = replace_once(
    flow,
    'import { type ReactFlowInstance } from "@xyflow/react";\n',
    '',
    'React Flow instance import',
)

anchor = 'import { useCanvasSessionState } from "@/components/assistant-ui/thread-graph-flow/use-canvas-session-state";\n'
flow = replace_once(
    flow,
    anchor,
    anchor
    + 'import { useCanvasViewportController } from "@/components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller";\n',
    'canvas session state import',
)

flow = replace_once(
    flow,
    '  const [reactFlowInstance, setReactFlowInstance] = React.useState<\n'
    '    ReactFlowInstance<ThreadGraphFlowNode, ThreadGraphFlowEdge> | null\n'
    '  >(null);\n',
    '',
    'React Flow instance state',
)
flow = replace_once(flow, '    treeSignatureRef,\n', '', 'session tree signature ref')

viewport_effects_start = '''  React.useEffect(() => {
    if (!reactFlowInstance || decoratedFlowNodes.length === 0) return;
'''
viewport_effects_end = '''  }, [draft, flowRenderMode, reactFlowInstance, setStoredViewport]);

'''
flow = remove_range(
    flow,
    viewport_effects_start,
    viewport_effects_end,
    'canvas viewport effects',
)

structure_marker = '''  const treeStructureSignature = React.useMemo(
  () =>
    buildTreeStructureSignature(
      canvasConversationNodes,
      baseConversationEdges,
    ),
  [baseConversationEdges, canvasConversationNodes],
);

'''
viewport_usage = structure_marker + '''  const {
    handleFocusSelected,
    handleResetView,
    reactFlowInstance,
    setReactFlowInstance,
  } = useCanvasViewportController({
    decoratedNodeCount: decoratedFlowNodes.length,
    densityMode,
    draftActive: !!draft,
    flowRenderMode,
    focusedMessageId,
    nodeIndex,
    selectedNodeId,
    setStoredViewport,
    treeStructureSignature,
    visibleNodeCount: visibleFlowNodes.length,
  });

'''
flow = replace_once(
    flow,
    structure_marker,
    viewport_usage,
    'tree structure signature block',
)

focus_callback = '''  const handleFocusSelected = React.useCallback(async () => {
    if (!reactFlowInstance || !selectedNodeId) return;
    await reactFlowInstance.fitView({
      duration: 500,
      padding: 0.4,
      nodes: [{ id: selectedNodeId }],
    });
    setStoredViewport(reactFlowInstance.getViewport());
  }, [reactFlowInstance, selectedNodeId, setStoredViewport]);

'''
flow = replace_once(flow, focus_callback, '', 'focus selected callback')

reset_callback = '''  const handleResetView = React.useCallback(async () => {
    if (!reactFlowInstance) return;
    await reactFlowInstance.fitView({ duration: 450, padding: 0.18 });
    setStoredViewport(reactFlowInstance.getViewport());
  }, [reactFlowInstance, setStoredViewport]);

'''
flow = replace_once(flow, reset_callback, '', 'reset view callback')
FLOW_PATH.write_text(flow, encoding="utf-8")

session_hook = SESSION_HOOK_PATH.read_text(encoding="utf-8")
session_hook = replace_once(
    session_hook,
    '  const treeSignatureRef = React.useRef<string | null>(null);\n',
    '',
    'session tree signature ref state',
)
session_hook = replace_once(
    session_hook,
    '    treeSignatureRef.current = null;\n',
    '',
    'session tree signature reset',
)
session_hook = replace_once(
    session_hook,
    '    treeSignatureRef,\n',
    '',
    'session tree signature return value',
)
SESSION_HOOK_PATH.write_text(session_hook, encoding="utf-8")

write_new(
    VIEWPORT_HOOK_PATH,
    '''"use client";\n\nimport {\n  type ReactFlowInstance,\n  type Viewport,\n} from "@xyflow/react";\nimport React from "react";\nimport {\n  type FlowDensityMode,\n  type FlowRenderMode,\n  CANVAS_PROMPT_DRAFT_NODE_ID,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";\nimport type {\n  ThreadGraphFlowEdge,\n  ThreadGraphFlowNode,\n} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\n\ntype CanvasFlowInstance = ReactFlowInstance<\n  ThreadGraphFlowNode,\n  ThreadGraphFlowEdge\n>;\n\ntype UseCanvasViewportControllerOptions = {\n  decoratedNodeCount: number;\n  densityMode: FlowDensityMode;\n  draftActive: boolean;\n  flowRenderMode: FlowRenderMode;\n  focusedMessageId: string | null;\n  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;\n  selectedNodeId: string | null;\n  setStoredViewport: (viewport: Viewport) => void;\n  treeStructureSignature: string;\n  visibleNodeCount: number;\n};\n\nexport const shouldRefitCanvasTree = (\n  previousSignature: string | null,\n  nextSignature: string,\n) => previousSignature !== null && previousSignature !== nextSignature;\n\nexport function useCanvasViewportController({\n  decoratedNodeCount,\n  densityMode,\n  draftActive,\n  flowRenderMode,\n  focusedMessageId,\n  nodeIndex,\n  selectedNodeId,\n  setStoredViewport,\n  treeStructureSignature,\n  visibleNodeCount,\n}: UseCanvasViewportControllerOptions) {\n  const [reactFlowInstance, setReactFlowInstance] =\n    React.useState<CanvasFlowInstance | null>(null);\n  const treeSignatureRef = React.useRef<string | null>(null);\n\n  React.useEffect(() => {\n    if (!reactFlowInstance || decoratedNodeCount === 0) return;\n\n    const previousSignature = treeSignatureRef.current;\n    treeSignatureRef.current = treeStructureSignature;\n\n    if (!shouldRefitCanvasTree(previousSignature, treeStructureSignature)) return;\n\n    const animationFrame = window.requestAnimationFrame(() => {\n      void reactFlowInstance\n        .fitView({\n          duration: 420,\n          padding: 0.22,\n        })\n        .then(() => {\n          setStoredViewport(reactFlowInstance.getViewport());\n        });\n    });\n\n    return () => {\n      window.cancelAnimationFrame(animationFrame);\n    };\n  }, [\n    decoratedNodeCount,\n    reactFlowInstance,\n    setStoredViewport,\n    treeStructureSignature,\n  ]);\n\n  React.useEffect(() => {\n    if (!reactFlowInstance || !focusedMessageId || !nodeIndex.has(focusedMessageId)) {\n      return;\n    }\n    const animationFrame = window.requestAnimationFrame(() => {\n      void reactFlowInstance\n        .fitView({\n          duration: 260,\n          padding: 0.34,\n          nodes: [{ id: focusedMessageId }],\n        })\n        .then(() => {\n          setStoredViewport(reactFlowInstance.getViewport());\n        });\n    });\n    return () => {\n      window.cancelAnimationFrame(animationFrame);\n    };\n  }, [focusedMessageId, nodeIndex, reactFlowInstance, setStoredViewport]);\n\n  React.useEffect(() => {\n    if (!reactFlowInstance || densityMode !== "focus" || !selectedNodeId) return;\n    const animationFrame = window.requestAnimationFrame(() => {\n      void reactFlowInstance\n        .fitView({\n          duration: 280,\n          padding: 0.28,\n        })\n        .then(() => {\n          setStoredViewport(reactFlowInstance.getViewport());\n        });\n    });\n    return () => {\n      window.cancelAnimationFrame(animationFrame);\n    };\n  }, [\n    densityMode,\n    reactFlowInstance,\n    selectedNodeId,\n    setStoredViewport,\n    visibleNodeCount,\n  ]);\n\n  React.useEffect(() => {\n    if (!reactFlowInstance || !draftActive || flowRenderMode !== "2d") return;\n    const animationFrame = window.requestAnimationFrame(() => {\n      void reactFlowInstance\n        .fitView({\n          duration: 320,\n          padding: 0.34,\n          nodes: [{ id: CANVAS_PROMPT_DRAFT_NODE_ID }],\n        })\n        .then(() => {\n          setStoredViewport(reactFlowInstance.getViewport());\n        });\n    });\n    return () => {\n      window.cancelAnimationFrame(animationFrame);\n    };\n  }, [draftActive, flowRenderMode, reactFlowInstance, setStoredViewport]);\n\n  const handleFocusSelected = React.useCallback(async () => {\n    if (!reactFlowInstance || !selectedNodeId) return;\n    await reactFlowInstance.fitView({\n      duration: 500,\n      padding: 0.4,\n      nodes: [{ id: selectedNodeId }],\n    });\n    setStoredViewport(reactFlowInstance.getViewport());\n  }, [reactFlowInstance, selectedNodeId, setStoredViewport]);\n\n  const handleResetView = React.useCallback(async () => {\n    if (!reactFlowInstance) return;\n    await reactFlowInstance.fitView({ duration: 450, padding: 0.18 });\n    setStoredViewport(reactFlowInstance.getViewport());\n  }, [reactFlowInstance, setStoredViewport]);\n\n  return {\n    handleFocusSelected,\n    handleResetView,\n    reactFlowInstance,\n    setReactFlowInstance,\n  };\n}\n''',
)

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { shouldRefitCanvasTree } from "@/components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller";\n\ndescribe("shouldRefitCanvasTree", () => {\n  it("does not refit during the initial graph hydration", () => {\n    expect(shouldRefitCanvasTree(null, "tree-a")).toBe(false);\n  });\n\n  it("does not refit when the graph structure is unchanged", () => {\n    expect(shouldRefitCanvasTree("tree-a", "tree-a")).toBe(false);\n  });\n\n  it("refits when an existing graph changes structure", () => {\n    expect(shouldRefitCanvasTree("tree-a", "tree-b")).toBe(true);\n  });\n});\n''',
)

print("Canvas viewport controller refactor prepared successfully.")
