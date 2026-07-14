from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW_PATH = ROOT / "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx"
GRAPH_HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-graph-view-model.ts"
INSPECTOR_HOOK_PATH = ROOT / "components/assistant-ui/thread-graph-flow/use-canvas-inspector-view-model.ts"
VIEW_PATH = ROOT / "components/assistant-ui/thread-graph-flow/canvas-workspace-view.tsx"
GRAPH_TEST_PATH = ROOT / "tests/canvas-graph-view-model.test.ts"
INSPECTOR_TEST_PATH = ROOT / "tests/canvas-inspector-view-model.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def remove_between(text: str, start_marker: str, end_marker: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        fail(f"Could not locate {label}.")
    return text[:start] + text[end:]


def remove_including(text: str, start_marker: str, end_marker: str, label: str) -> str:
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
    'import { buildGraphLegendItems } from "@/components/assistant-ui/thread-graph/graph-models";\n',
    '',
    'graph legend import',
)
flow = replace_once(
    flow,
    '''import {
  buildCanvasFilterCounts,
  buildFocusPathNodeIds,
  buildGraphStructureSignature,
  buildRelatedContextIds,
  buildSelectedLineage,
  buildTreeStructureSignature,
  decorateCanvasEdges,
  decorateCanvasNodes,
  filterCanvasGraph,
  resolveCanvasVisibleNodeIds,
} from "@/components/assistant-ui/thread-graph-flow/canvas-graph-projection";
''',
    '',
    'canvas graph projection imports',
)
for line, label in [
    ('import { CanvasBlockLibrary } from "@/components/assistant-ui/thread-graph-flow/block-library";\n', 'block library import'),
    ('import { CanvasArtifactInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-artifact-inspector";\n', 'artifact inspector import'),
    ('import { CanvasMessageInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-message-inspector";\n', 'message inspector import'),
    ('import { CanvasSidebar } from "@/components/assistant-ui/thread-graph-flow/canvas-sidebar";\n', 'canvas sidebar import'),
    ('import { CanvasStage } from "@/components/assistant-ui/thread-graph-flow/canvas-stage";\n', 'canvas stage import'),
    ('import { buildCanvasFlowElements } from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements";\n', 'flow elements import'),
    ('import { estimateDataUrlBytes } from "@/components/assistant-ui/thread-graph-flow/canvas-upload-utils";\n', 'upload estimate import'),
]:
    flow = replace_once(flow, line, '', label)
flow = replace_once(
    flow,
    '''import {
  artifactAccent,
  artifactTypeLabel,
  CANVAS_BRANCH_RUN_NOTICE,
  formatByteSize,
  scrollMessageIntoView,
  trimArtifactPreview,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
''',
    '''import {
  CANVAS_BRANCH_RUN_NOTICE,
  scrollMessageIntoView,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
''',
    'canvas workspace utility imports',
)
flow = replace_once(
    flow,
    '''import {
  getArtifactLineCount,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
''',
    '',
    'artifact presentation imports',
)
flow = replace_once(
    flow,
    '''import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
''',
    '',
    'thread graph flow types import',
)
flow = replace_once(
    flow,
    '''import {
  buildBranchSpec,
  getAllowedBranchOperations,
  getBranchOperationDetail,
} from "@/lib/thread-branching";
''',
    '''import {
  buildBranchSpec,
  getBranchOperationDetail,
} from "@/lib/thread-branching";
''',
    'thread branching imports',
)

anchor = 'import { useCanvasViewportController } from "@/components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller";\n'
flow = replace_once(
    flow,
    anchor,
    anchor
    + 'import { useCanvasGraphViewModel } from "@/components/assistant-ui/thread-graph-flow/use-canvas-graph-view-model";\n'
    + 'import { useCanvasInspectorViewModel } from "@/components/assistant-ui/thread-graph-flow/use-canvas-inspector-view-model";\n'
    + 'import { CanvasWorkspaceView } from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-view";\n',
    'viewport controller import',
)

flow = remove_including(
    flow,
    '  const linkedTargetCountByArtifact = React.useMemo(() => {\n',
    '  }, [artifacts, canvasPrompts.length, nodes]);\n\n',
    'linked target counts and legend model',
)
flow = remove_including(
    flow,
    '  const selectedContextLinkedMessageIds = React.useMemo(() => {\n',
    '  }, [contextLinks, selectedArtifact]);\n\n',
    'selected linked message ids',
)
flow = remove_between(
    flow,
    '  const filterCounts = React.useMemo(\n',
    '  const {\n    canvasDraftError,\n',
    'graph selection projection block',
)
flow = remove_including(
    flow,
    '  React.useEffect(() => {\n    const inspector = inspectorScrollRef.current;\n',
    '  ]);\n\n',
    'inspector scroll effect',
)
flow = remove_including(
    flow,
    '  const relatedContextIds = React.useMemo(\n',
    ');\n\n',
    'related context projection',
)

flow_model_start = '  const {\n    conversationEdges: baseConversationEdges,\n'
viewport_start = '  const {\n    handleFocusSelected,\n'
flow = remove_between(flow, flow_model_start, viewport_start, 'flow visual model block')

graph_hook_usage = '''  const {
    decoratedFlowEdges,
    decoratedFlowNodes,
    filterCounts,
    flowNodeCount,
    graphStructureSignature,
    hiddenCanvasNodeCount,
    legendItems,
    selectedContextLinkedMessageIds,
    selectedFlowNode,
    treeStructureSignature,
    visibleCanvasNodeCount,
  } = useCanvasGraphViewModel({
    artifacts,
    artifactIndex,
    canvasConversationNodes,
    canvasLinks,
    canvasPrompts,
    cancelCanvasPrompt,
    canvasDraftError,
    contextLinks,
    deleteArtifact,
    densityMode,
    draft,
    draftAnchorNode,
    draftBranchSpec,
    draftContextCount: draftContextArtifacts.length,
    draftDetail,
    getArtifactsForTarget,
    handleCancelPromptDraft,
    handleCancelRun,
    handleCutEdge,
    handleSubmitBranchDraft,
    isSubmittingBranch,
    isThreadRunning,
    legendNodes: nodes,
    linkEditMode,
    llmEnabled,
    nodeIndex,
    overrides,
    promptIndex,
    requestError,
    runCanvasPrompt,
    selectedArtifactId: selectedArtifact?.id ?? null,
    selectedContextArtifactIds,
    selectedNodeId,
    setDraftText,
    spotlight,
    updateArtifact,
  });

'''
flow = replace_once(
    flow,
    '  const {\n    handleFocusSelected,\n',
    graph_hook_usage + '  const {\n    handleFocusSelected,\n',
    'viewport controller declaration',
)
flow = replace_once(
    flow,
    '    visibleNodeCount: visibleFlowNodes.length,\n',
    '    visibleNodeCount: visibleCanvasNodeCount,\n',
    'viewport visible node count',
)
flow = remove_including(
    flow,
    '  const selectedFlowNode = React.useMemo(\n',
    '  }, [selectedMessageNode]);\n\n',
    'selected flow node and branch options',
)

inspector_start = '  const selectedBranchTrail = React.useMemo(() => {\n'
return_start = '  return (\n    <section className="relative flex h-full min-h-0 flex-col overflow-hidden'
flow = remove_between(flow, inspector_start, return_start, 'inspector view model and main render')

inspector_usage = '''  const {
    attachableTargets,
    selectedArtifactLineCount,
    selectedArtifactPreviewSize,
    selectedArtifactSize,
    selectedArtifactStatChips,
    selectedBranchOptions,
    selectedBranchPathLabel,
    selectedCanvasLabel,
    selectedCanvasPreview,
    selectedPreview,
    showCanvasPromptCta,
    showInspector,
  } = useCanvasInspectorViewModel({
    canvasConversationNodes,
    draft,
    inspectorScrollRef,
    linkEditMode,
    nodeIndex,
    resetLinkCount: overrides.size,
    selectedArtifact,
    selectedContextArtifacts,
    selectedFlowNode,
    selectedMessageNode,
    selectedNodeId,
  });

'''

new_return = '''  return (
    <CanvasWorkspaceView
      imageUploadInputRef={imageUploadInputRef}
      fileUploadInputRef={fileUploadInputRef}
      onImageUploadChange={handleImageUploadChange}
      onFileUploadChange={handleFileUploadChange}
      inspectorScrollRef={inspectorScrollRef}
      blockLibraryProps={{
        collapsed: blockLibraryCollapsed,
        onAddBlock: handleAddCanvasBlock,
        onCollapsedChange: setBlockLibraryCollapsed,
      }}
      sidebarProps={{
        activeCanvasRunCount,
        artifactCount: artifacts.length,
        connectionError,
        densityMode,
        filterCounts,
        flowNodeCount,
        flowRenderMode,
        hiddenCanvasNodeCount,
        legendItems,
        linkEditMode,
        onCancelAllRuns: cancelAllCanvasRuns,
        onCopyJson: handleCopyJson,
        onCreatePrompt: () => handleCreatePromptNode(),
        onDensityModeChange: setDensityMode,
        onFlowRenderModeChange: setFlowRenderMode,
        onLinkEditModeChange: setLinkEditMode,
        onResetLinks: resetLinks,
        onSpotlightChange: setSpotlight,
        onToolbarMenuChange: setToolbarMenu,
        promptDisabled: !llmEnabled,
        queuedCanvasRunCount,
        resetLinkCount: overrides.size,
        selectedBranchPathLabel,
        selectedCanvasLabel,
        selectedCanvasPreview,
        selectedNodeId,
        showCanvasPromptCta,
        showInspector,
        spotlight,
        toolbarMenu,
        toolbarMenuRef,
        visibleCanvasNodeCount,
      }}
      artifactInspectorProps={
        selectedArtifact
          ? {
              artifact: selectedArtifact,
              artifactLineCount: selectedArtifactLineCount,
              artifactPreviewSize: selectedArtifactPreviewSize,
              artifactSize: selectedArtifactSize,
              artifactStatChips: selectedArtifactStatChips,
              attachableTargets,
              contextBudgetMaxImagePreviewBytes:
                contextBudgetPolicy.maxImagePreviewBytes,
              hasOutputLink: canvasLinks.some(
                (link) =>
                  link.relation === "output" &&
                  link.artifactId === selectedArtifact.id,
              ),
              isLinkedToTarget: (targetId) =>
                isArtifactLinkedToTarget(selectedArtifact.id, targetId),
              linkedTargetCount: selectedContextLinkedMessageIds.size,
              onConnectTo: handleArtifactConnectFromInspector,
              onDelete: () => {
                deleteArtifact(selectedArtifact.id);
                applyCanvasSelection(null);
              },
              onDisconnectOutput: () => {
                const outputLink = canvasLinks.find(
                  (link) =>
                    link.relation === "output" &&
                    link.artifactId === selectedArtifact.id,
                );
                if (outputLink) removeCanvasLink(outputLink.id);
              },
              onOpenTarget: applyCanvasSelection,
              onRestoreRevision: (revisionId) =>
                restoreArtifactRevision(selectedArtifact.id, revisionId),
              onToggleLink: (targetId) =>
                handleToggleArtifactLink(selectedArtifact.id, targetId),
              onToggleSync: () =>
                setArtifactSyncMode(
                  selectedArtifact.id,
                  selectedArtifact.syncMode === "paused" ? "auto" : "paused",
                ),
              onUpdate: (patch) => updateArtifact(selectedArtifact.id, patch),
            }
          : null
      }
      messageInspectorProps={
        selectedFlowNode && selectedMessageNode
          ? {
              activeDraft:
                draft && draft.anchorId === selectedMessageNode.id
                  ? { operation: draft.operation, text: draft.text }
                  : null,
              artifacts,
              busy: isSubmittingBranch,
              contextCount: selectedContextArtifacts.length,
              details: selectedBranchOptions,
              disabled: !llmEnabled,
              isLinkedToTarget: (artifactId) =>
                isArtifactLinkedToTarget(artifactId, selectedMessageNode.id),
              linkEditMode,
              onCancelDraft: handleCancelPromptDraft,
              onCancelRun: isThreadRunning ? handleCancelRun : undefined,
              onChooseOperation: handleChooseBranchOperation,
              onClearFocus: () => applyCanvasSelection(null),
              onCutSelected: handleCutSelected,
              onDraftTextChange: setDraftText,
              onFocusSelected: handleFocusSelected,
              onOpenInChat: handleOpenSelectedInChat,
              onResetView: handleResetView,
              onRestoreSelected: handleRestoreSelected,
              onSubmitDraft: handleSubmitBranchDraft,
              onToggleArtifactLink: (artifactId) =>
                handleToggleArtifactLink(artifactId, selectedMessageNode.id),
              runInterruptionNote: isThreadRunning
                ? CANVAS_BRANCH_RUN_NOTICE
                : null,
              selectedBranchPathLabel,
              selectedFlowNode,
              selectedNodeId,
              selectedOverride: !!selectedOverride,
              selectedParentId,
              selectedPreview,
            }
          : null
      }
      stageProps={{
        activeSessionId,
        edges: decoratedFlowEdges,
        flowRenderMode,
        graphStructureSignature,
        nodes: decoratedFlowNodes,
        onArtifactPositionChange: (artifactId, position) =>
          updateArtifact(artifactId, { position }),
        onCanvasConnect: handleCanvasConnect,
        onCanvasDragOver: handleCanvasDragOver,
        onCanvasDrop: handleCanvasDrop,
        onDraftPositionChange: setDraftPosition,
        onInit: setReactFlowInstance,
        onMessageOpen: (messageId) => {
          applyCanvasSelection(messageId);
          setViewMode("split");
          scrollMessageIntoView(messageId);
        },
        onNodeSelect: applyCanvasSelection,
        onViewportChange: setStoredViewport,
        selectedNodeId,
        storedViewport,
        viewportRef: flowViewportRef,
      }}
    />
  );
}
'''

return_index = flow.find(return_start)
if return_index < 0:
    fail('Could not locate main Canvas return block.')
flow = flow[:return_index] + inspector_usage + new_return
FLOW_PATH.write_text(flow, encoding="utf-8")

write_new(
    GRAPH_HOOK_PATH,
    '''"use client";\n\nimport React from "react";\nimport { buildGraphLegendItems } from "@/components/assistant-ui/thread-graph/graph-models";\nimport {\n  buildCanvasFilterCounts,\n  buildFocusPathNodeIds,\n  buildGraphStructureSignature,\n  buildRelatedContextIds,\n  buildSelectedLineage,\n  buildTreeStructureSignature,\n  decorateCanvasEdges,\n  decorateCanvasNodes,\n  filterCanvasGraph,\n  resolveCanvasVisibleNodeIds,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-graph-projection";\nimport {\n  buildCanvasFlowElements,\n  type CanvasFlowElementsParams,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-flow-elements";\nimport {\n  artifactAccent,\n  type FlowDensityMode,\n  type FlowSpotlightMode,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\nimport type { SessionArtifact } from "@/lib/session-artifacts";\n\ntype UseCanvasGraphViewModelOptions = Omit<\n  CanvasFlowElementsParams,\n  "linkedTargetCountByArtifact"\n> & {\n  densityMode: FlowDensityMode;\n  legendNodes: ThreadGraphNodeModel[];\n  selectedArtifactId: string | null;\n  selectedContextArtifactIds: ReadonlySet<string>;\n  selectedNodeId: string | null;\n  spotlight: FlowSpotlightMode;\n};\n\nexport function buildCanvasLegendItems(\n  legendNodes: ThreadGraphNodeModel[],\n  artifacts: SessionArtifact[],\n  canvasPrompts: SessionArtifact[],\n) {\n  const conversationLegend = buildGraphLegendItems(legendNodes);\n  const hasTextArtifacts = artifacts.some((artifact) => artifact.artifactType === "text");\n  const hasCodeArtifacts = artifacts.some((artifact) => artifact.artifactType === "code");\n  const hasImageArtifacts = artifacts.some((artifact) => artifact.artifactType === "image");\n  const hasFileArtifacts = artifacts.some((artifact) => artifact.artifactType === "file");\n  const hasCanvasPrompts = canvasPrompts.length > 0;\n\n  return [\n    ...conversationLegend,\n    ...(hasTextArtifacts\n      ? [{ key: "artifact-text", label: "Text Context", swatch: artifactAccent("text") }]\n      : []),\n    ...(hasCodeArtifacts\n      ? [{ key: "artifact-code", label: "Code Context", swatch: artifactAccent("code") }]\n      : []),\n    ...(hasImageArtifacts\n      ? [{ key: "artifact-image", label: "Image Context", swatch: artifactAccent("image") }]\n      : []),\n    ...(hasFileArtifacts\n      ? [{ key: "artifact-file", label: "File Context", swatch: artifactAccent("file") }]\n      : []),\n    ...(hasCanvasPrompts\n      ? [{ key: "canvas-prompt", label: "Independent Prompt", swatch: artifactAccent("prompt") }]\n      : []),\n  ];\n}\n\nexport function useCanvasGraphViewModel({\n  artifacts,\n  artifactIndex,\n  canvasConversationNodes,\n  canvasLinks,\n  canvasPrompts,\n  cancelCanvasPrompt,\n  canvasDraftError,\n  contextLinks,\n  deleteArtifact,\n  densityMode,\n  draft,\n  draftAnchorNode,\n  draftBranchSpec,\n  draftContextCount,\n  draftDetail,\n  getArtifactsForTarget,\n  handleCancelPromptDraft,\n  handleCancelRun,\n  handleCutEdge,\n  handleSubmitBranchDraft,\n  isSubmittingBranch,\n  isThreadRunning,\n  legendNodes,\n  linkEditMode,\n  llmEnabled,\n  nodeIndex,\n  overrides,\n  promptIndex,\n  requestError,\n  runCanvasPrompt,\n  selectedArtifactId,\n  selectedContextArtifactIds,\n  selectedNodeId,\n  setDraftText,\n  spotlight,\n  updateArtifact,\n}: UseCanvasGraphViewModelOptions) {\n  const linkedTargetCountByArtifact = React.useMemo(() => {\n    const counts = new Map<string, number>();\n    canvasLinks.forEach((link) => {\n      counts.set(link.artifactId, (counts.get(link.artifactId) ?? 0) + 1);\n    });\n    return counts;\n  }, [canvasLinks]);\n\n  const selectedContextLinkedMessageIds = React.useMemo(() => {\n    if (!selectedArtifactId) return new Set<string>();\n    return new Set(\n      contextLinks\n        .filter((link) => link.artifactId === selectedArtifactId)\n        .map((link) => link.targetMessageId),\n    );\n  }, [contextLinks, selectedArtifactId]);\n\n  const filterCounts = React.useMemo(\n    () => buildCanvasFilterCounts(canvasConversationNodes, artifacts.length),\n    [artifacts.length, canvasConversationNodes],\n  );\n  const selectedLineage = React.useMemo(\n    () =>\n      buildSelectedLineage({\n        canvasConversationNodes,\n        nodeIndex,\n        selectedArtifactId,\n        selectedNodeId,\n      }),\n    [canvasConversationNodes, nodeIndex, selectedArtifactId, selectedNodeId],\n  );\n  const focusPathNodeIds = React.useMemo(\n    () =>\n      buildFocusPathNodeIds({\n        canvasConversationNodes,\n        nodeIndex,\n        selectedArtifactId,\n        selectedContextArtifactIds,\n        selectedContextLinkedMessageIds,\n        selectedNodeId,\n      }),\n    [\n      canvasConversationNodes,\n      nodeIndex,\n      selectedArtifactId,\n      selectedContextArtifactIds,\n      selectedContextLinkedMessageIds,\n      selectedNodeId,\n    ],\n  );\n  const relatedContextIds = React.useMemo(\n    () =>\n      buildRelatedContextIds(\n        selectedContextArtifactIds,\n        selectedContextLinkedMessageIds,\n      ),\n    [selectedContextArtifactIds, selectedContextLinkedMessageIds],\n  );\n\n  const flowElementParams = React.useMemo<CanvasFlowElementsParams>(\n    () => ({\n      artifacts,\n      artifactIndex,\n      canvasConversationNodes,\n      canvasLinks,\n      canvasPrompts,\n      cancelCanvasPrompt,\n      canvasDraftError,\n      contextLinks,\n      deleteArtifact,\n      draft,\n      draftAnchorNode,\n      draftBranchSpec,\n      draftContextCount,\n      draftDetail,\n      getArtifactsForTarget,\n      handleCancelPromptDraft,\n      handleCancelRun,\n      handleCutEdge,\n      handleSubmitBranchDraft,\n      isSubmittingBranch,\n      isThreadRunning,\n      linkedTargetCountByArtifact,\n      linkEditMode,\n      llmEnabled,\n      nodeIndex,\n      overrides,\n      promptIndex,\n      requestError,\n      runCanvasPrompt,\n      setDraftText,\n      updateArtifact,\n    }),\n    [\n      artifacts,\n      artifactIndex,\n      canvasConversationNodes,\n      canvasLinks,\n      canvasPrompts,\n      cancelCanvasPrompt,\n      canvasDraftError,\n      contextLinks,\n      deleteArtifact,\n      draft,\n      draftAnchorNode,\n      draftBranchSpec,\n      draftContextCount,\n      draftDetail,\n      getArtifactsForTarget,\n      handleCancelPromptDraft,\n      handleCancelRun,\n      handleCutEdge,\n      handleSubmitBranchDraft,\n      isSubmittingBranch,\n      isThreadRunning,\n      linkedTargetCountByArtifact,\n      linkEditMode,\n      llmEnabled,\n      nodeIndex,\n      overrides,\n      promptIndex,\n      requestError,\n      runCanvasPrompt,\n      setDraftText,\n      updateArtifact,\n    ],\n  );\n\n  const { conversationEdges, edges: flowEdges, nodes: flowNodes } = React.useMemo(\n    () => buildCanvasFlowElements(flowElementParams),\n    [flowElementParams],\n  );\n  const visibleNodeIds = React.useMemo(\n    () =>\n      resolveCanvasVisibleNodeIds({\n        densityMode,\n        focusPathNodeIds,\n        selectedNodeId,\n      }),\n    [densityMode, focusPathNodeIds, selectedNodeId],\n  );\n  const { nodes: visibleFlowNodes, edges: visibleFlowEdges } = React.useMemo(\n    () => filterCanvasGraph(flowNodes, flowEdges, visibleNodeIds),\n    [flowEdges, flowNodes, visibleNodeIds],\n  );\n  const decoratedFlowNodes = React.useMemo(\n    () =>\n      decorateCanvasNodes({\n        nodeIndex,\n        relatedContextIds,\n        selectedLineage,\n        selectedNodeId,\n        spotlight,\n        visibleFlowNodes,\n      }),\n    [\n      nodeIndex,\n      relatedContextIds,\n      selectedLineage,\n      selectedNodeId,\n      spotlight,\n      visibleFlowNodes,\n    ],\n  );\n  const decoratedFlowEdges = React.useMemo(\n    () =>\n      decorateCanvasEdges({\n        decoratedFlowNodes,\n        relatedContextIds,\n        selectedLineage,\n        selectedNodeId,\n        spotlight,\n        visibleFlowEdges,\n      }),\n    [\n      decoratedFlowNodes,\n      relatedContextIds,\n      selectedLineage,\n      selectedNodeId,\n      spotlight,\n      visibleFlowEdges,\n    ],\n  );\n  const graphStructureSignature = React.useMemo(\n    () => buildGraphStructureSignature(decoratedFlowNodes, decoratedFlowEdges),\n    [decoratedFlowEdges, decoratedFlowNodes],\n  );\n  const treeStructureSignature = React.useMemo(\n    () => buildTreeStructureSignature(canvasConversationNodes, conversationEdges),\n    [canvasConversationNodes, conversationEdges],\n  );\n  const legendItems = React.useMemo(\n    () => buildCanvasLegendItems(legendNodes, artifacts, canvasPrompts),\n    [artifacts, canvasPrompts, legendNodes],\n  );\n  const selectedFlowNode = React.useMemo(\n    () => decoratedFlowNodes.find((node) => node.id === selectedNodeId) ?? null,\n    [decoratedFlowNodes, selectedNodeId],\n  );\n  const visibleCanvasNodeCount = decoratedFlowNodes.length;\n\n  return {\n    decoratedFlowEdges,\n    decoratedFlowNodes,\n    filterCounts,\n    flowNodeCount: flowNodes.length,\n    graphStructureSignature,\n    hiddenCanvasNodeCount: Math.max(0, flowNodes.length - visibleCanvasNodeCount),\n    legendItems,\n    selectedContextLinkedMessageIds,\n    selectedFlowNode,\n    treeStructureSignature,\n    visibleCanvasNodeCount,\n  };\n}\n''',
)

write_new(
    INSPECTOR_HOOK_PATH,
    '''"use client";\n\nimport React from "react";\nimport {\n  getArtifactLineCount,\n  getArtifactStatChips,\n} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";\nimport { estimateDataUrlBytes } from "@/components/assistant-ui/thread-graph-flow/canvas-upload-utils";\nimport {\n  artifactTypeLabel,\n  formatByteSize,\n  trimArtifactPreview,\n} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";\nimport type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";\nimport {\n  ROOT_NODE_ID,\n  type Node as ThreadGraphNodeModel,\n} from "@/components/assistant-ui/thread-graph/graph-types";\nimport type { GraphBranchIntent } from "@/components/context/graph-branch-intent";\nimport {\n  getAllowedBranchOperations,\n  getBranchOperationDetail,\n} from "@/lib/thread-branching";\nimport type { SessionArtifact } from "@/lib/session-artifacts";\n\ntype UseCanvasInspectorViewModelOptions = {\n  canvasConversationNodes: ThreadGraphNodeModel[];\n  draft: GraphBranchIntent | null;\n  inspectorScrollRef: React.RefObject<HTMLDivElement | null>;\n  linkEditMode: boolean;\n  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;\n  resetLinkCount: number;\n  selectedArtifact: SessionArtifact | null;\n  selectedContextArtifacts: SessionArtifact[];\n  selectedFlowNode: ThreadGraphFlowNode | null;\n  selectedMessageNode: ThreadGraphNodeModel | null;\n  selectedNodeId: string | null;\n};\n\nexport function buildCanvasBranchTrail(\n  selectedMessageNode: ThreadGraphNodeModel | null,\n  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>,\n) {\n  if (!selectedMessageNode) return [];\n\n  const formatTrailLabel = (node: ThreadGraphNodeModel) => {\n    if (node.id === ROOT_NODE_ID) return "root";\n    const preview = node.text.replace(/\\s+/g, " ").trim();\n    if (!preview) return node.role === "assistant" ? "assistant reply" : "user prompt";\n    return preview.length > 28 ? `${preview.slice(0, 25)}...` : preview;\n  };\n\n  const trail: string[] = [];\n  const visited = new Set<string>();\n  let currentId: string | null = selectedMessageNode.id;\n\n  while (currentId && !visited.has(currentId)) {\n    visited.add(currentId);\n    const node = nodeIndex.get(currentId);\n    if (!node) break;\n    trail.unshift(formatTrailLabel(node));\n    currentId = node.parentId;\n  }\n\n  return trail;\n}\n\nexport function useCanvasInspectorViewModel({\n  canvasConversationNodes,\n  draft,\n  inspectorScrollRef,\n  linkEditMode,\n  nodeIndex,\n  resetLinkCount,\n  selectedArtifact,\n  selectedContextArtifacts,\n  selectedFlowNode,\n  selectedMessageNode,\n  selectedNodeId,\n}: UseCanvasInspectorViewModelOptions) {\n  React.useEffect(() => {\n    const inspector = inspectorScrollRef.current;\n    if (!inspector) return;\n    inspector.scrollTop = 0;\n  }, [\n    draft?.anchorId,\n    draft?.operation,\n    inspectorScrollRef,\n    linkEditMode,\n    selectedArtifact?.id,\n    selectedMessageNode?.id,\n    selectedNodeId,\n  ]);\n\n  const selectedBranchOptions = React.useMemo(() => {\n    if (!selectedMessageNode) return [];\n    return getAllowedBranchOperations(selectedMessageNode).map(getBranchOperationDetail);\n  }, [selectedMessageNode]);\n  const selectedBranchPathLabel = React.useMemo(\n    () => buildCanvasBranchTrail(selectedMessageNode, nodeIndex).join(" > "),\n    [nodeIndex, selectedMessageNode],\n  );\n  const selectedPreview =\n    selectedFlowNode?.data.preview?.replace(/\\s+/g, " ").trim() ?? "";\n  const selectedArtifactSize = formatByteSize(selectedArtifact?.byteSize);\n  const selectedArtifactPreviewSize = selectedArtifact?.sourceDataUrl\n    ? formatByteSize(estimateDataUrlBytes(selectedArtifact.sourceDataUrl))\n    : null;\n  const selectedArtifactStatChips = React.useMemo(\n    () => (selectedArtifact ? getArtifactStatChips(selectedArtifact) : []),\n    [selectedArtifact],\n  );\n  const selectedArtifactLineCount = React.useMemo(\n    () => (selectedArtifact ? getArtifactLineCount(selectedArtifact) : 0),\n    [selectedArtifact],\n  );\n  const selectedCanvasLabel = React.useMemo(() => {\n    if (selectedArtifact) return `${artifactTypeLabel(selectedArtifact)} selected`;\n    if (selectedMessageNode) return `${selectedMessageNode.role} branch selected`;\n    return "No active focus";\n  }, [selectedArtifact, selectedMessageNode]);\n  const selectedCanvasPreview = React.useMemo(() => {\n    if (selectedArtifact) return trimArtifactPreview(selectedArtifact);\n    if (selectedPreview.length > 0) return selectedPreview;\n    return "Use the canvas to branch, compare, and pin reusable context.";\n  }, [selectedArtifact, selectedPreview]);\n  const showCanvasPromptCta =\n    !draft &&\n    !selectedArtifact &&\n    (!selectedMessageNode || selectedMessageNode.id === ROOT_NODE_ID);\n  const attachableTargets = React.useMemo(\n    () =>\n      canvasConversationNodes\n        .filter((node) => !node.isBridge)\n        .map((node) => ({\n          id: node.id,\n          preview:\n            node.text.replace(/\\s+/g, " ").trim() ||\n            (node.id === ROOT_NODE_ID ? "Conversation root" : "No preview"),\n          role: node.id === ROOT_NODE_ID ? "root" : node.role,\n        })),\n    [canvasConversationNodes],\n  );\n\n  return {\n    attachableTargets,\n    selectedArtifactLineCount,\n    selectedArtifactPreviewSize,\n    selectedArtifactSize,\n    selectedArtifactStatChips,\n    selectedBranchOptions,\n    selectedBranchPathLabel,\n    selectedCanvasLabel,\n    selectedCanvasPreview,\n    selectedPreview,\n    showCanvasPromptCta,\n    showInspector:\n      !!selectedArtifact ||\n      (!!selectedFlowNode && !!selectedMessageNode) ||\n      linkEditMode ||\n      resetLinkCount > 0,\n    selectedContextCount: selectedContextArtifacts.length,\n  };\n}\n''',
)

write_new(
    VIEW_PATH,
    '''"use client";\n\nimport React from "react";\nimport { CanvasBlockLibrary } from "@/components/assistant-ui/thread-graph-flow/block-library";\nimport { CanvasArtifactInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-artifact-inspector";\nimport { CanvasMessageInspector } from "@/components/assistant-ui/thread-graph-flow/canvas-message-inspector";\nimport { CanvasSidebar } from "@/components/assistant-ui/thread-graph-flow/canvas-sidebar";\nimport { CanvasStage } from "@/components/assistant-ui/thread-graph-flow/canvas-stage";\n\ntype CanvasWorkspaceViewProps = {\n  artifactInspectorProps: React.ComponentProps<typeof CanvasArtifactInspector> | null;\n  blockLibraryProps: React.ComponentProps<typeof CanvasBlockLibrary>;\n  fileUploadInputRef: React.RefObject<HTMLInputElement | null>;\n  imageUploadInputRef: React.RefObject<HTMLInputElement | null>;\n  inspectorScrollRef: React.RefObject<HTMLDivElement | null>;\n  messageInspectorProps: React.ComponentProps<typeof CanvasMessageInspector> | null;\n  onFileUploadChange: React.ChangeEventHandler<HTMLInputElement>;\n  onImageUploadChange: React.ChangeEventHandler<HTMLInputElement>;\n  sidebarProps: Omit<React.ComponentProps<typeof CanvasSidebar>, "children">;\n  stageProps: React.ComponentProps<typeof CanvasStage>;\n};\n\nexport function CanvasWorkspaceView({\n  artifactInspectorProps,\n  blockLibraryProps,\n  fileUploadInputRef,\n  imageUploadInputRef,\n  inspectorScrollRef,\n  messageInspectorProps,\n  onFileUploadChange,\n  onImageUploadChange,\n  sidebarProps,\n  stageProps,\n}: CanvasWorkspaceViewProps) {\n  return (\n    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.08),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.9))]">\n      <input\n        ref={imageUploadInputRef}\n        type="file"\n        accept="image/*"\n        data-testid="artifact-image-upload-input"\n        className="hidden"\n        onChange={onImageUploadChange}\n      />\n      <input\n        ref={fileUploadInputRef}\n        type="file"\n        className="hidden"\n        onChange={onFileUploadChange}\n      />\n      <div className="flex min-h-0 flex-1 overflow-hidden">\n        <CanvasBlockLibrary {...blockLibraryProps} />\n        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:flex-row">\n          <CanvasSidebar {...sidebarProps}>\n            <div\n              ref={inspectorScrollRef}\n              className="max-h-[min(34rem,calc(100vh-11rem))] overflow-y-auto rounded-[26px] border border-border/60 bg-background/85 px-3 py-3 shadow-sm"\n            >\n              {artifactInspectorProps ? (\n                <CanvasArtifactInspector {...artifactInspectorProps} />\n              ) : messageInspectorProps ? (\n                <CanvasMessageInspector {...messageInspectorProps} />\n              ) : (\n                <div className="space-y-2 rounded-[24px] border border-dashed border-border/70 bg-background/80 px-4 py-5 text-left">\n                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">\n                    Nothing selected\n                  </p>\n                  <p className="text-sm font-medium text-foreground/85">\n                    Pick a message node to branch, or select an artifact to shape\n                    reusable context.\n                  </p>\n                  <p className="text-xs leading-5 text-muted-foreground">\n                    The canvas is your structured input layer. Use it to build\n                    artifacts the model can reason over without losing\n                    human-readable form.\n                  </p>\n                </div>\n              )}\n            </div>\n          </CanvasSidebar>\n          <CanvasStage {...stageProps} />\n        </div>\n      </div>\n    </section>\n  );\n}\n''',
)

write_new(
    GRAPH_TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { buildCanvasLegendItems } from "@/components/assistant-ui/thread-graph-flow/use-canvas-graph-view-model";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\nimport type { SessionArtifact } from "@/lib/session-artifacts";\n\nconst root: ThreadGraphNodeModel = {\n  id: "root",\n  parentId: null,\n  role: "ROOT",\n  text: "root",\n  depth: 0,\n  idx: -1,\n  branchId: null,\n  isBridge: false,\n  model: null,\n  provider: null,\n};\n\nconst artifact = (id: string, artifactType: SessionArtifact["artifactType"]): SessionArtifact => ({\n  id,\n  artifactType,\n  semanticType: artifactType,\n  title: id,\n  content: id,\n  createdAt: 1,\n  updatedAt: 1,\n  syncMode: "auto",\n  revisions: [],\n});\n\ndescribe("buildCanvasLegendItems", () => {\n  it("adds entries for present artifact categories and independent prompts", () => {\n    const items = buildCanvasLegendItems(\n      [root],\n      [artifact("text", "text"), artifact("code", "code")],\n      [artifact("prompt", "prompt")],\n    );\n\n    expect(items.map((item) => item.key)).toEqual(\n      expect.arrayContaining(["artifact-text", "artifact-code", "canvas-prompt"]),\n    );\n  });\n});\n''',
)

write_new(
    INSPECTOR_TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { buildCanvasBranchTrail } from "@/components/assistant-ui/thread-graph-flow/use-canvas-inspector-view-model";\nimport type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";\n\nconst node = (\n  id: string,\n  parentId: string | null,\n  text: string,\n  role: ThreadGraphNodeModel["role"],\n): ThreadGraphNodeModel => ({\n  id,\n  parentId,\n  text,\n  role,\n  depth: parentId ? 1 : 0,\n  idx: 0,\n  branchId: null,\n  isBridge: false,\n  model: null,\n  provider: null,\n});\n\ndescribe("buildCanvasBranchTrail", () => {\n  it("builds a root-to-selection label trail", () => {\n    const root = node("root", null, "root", "ROOT");\n    const prompt = node("prompt", "root", "Explain the architecture", "user");\n    const response = node("response", "prompt", "Detailed response", "assistant");\n    const index = new Map([\n      [root.id, root],\n      [prompt.id, prompt],\n      [response.id, response],\n    ]);\n\n    expect(buildCanvasBranchTrail(response, index)).toEqual([\n      "root",\n      "Explain the architecture",\n      "Detailed response",\n    ]);\n  });\n\n  it("stops safely when a cycle is present", () => {\n    const first = node("first", "second", "First", "user");\n    const second = node("second", "first", "Second", "assistant");\n    const index = new Map([\n      [first.id, first],\n      [second.id, second],\n    ]);\n\n    expect(buildCanvasBranchTrail(first, index)).toEqual(["Second", "First"]);\n  });\n});\n''',
)

print("Canvas graph and workspace view refactor prepared successfully.")
