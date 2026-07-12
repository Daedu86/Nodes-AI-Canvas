import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";
import type { GraphBranchIntent } from "@/components/context/graph-branch-intent";
import type {
  BranchOperationDetail,
  BranchSpec,
} from "@/lib/thread-branching";
import type {
  SessionArtifact,
  SessionCanvasLink,
} from "@/lib/session-artifacts";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

type SessionArtifactsApi = ReturnType<
  typeof import("@/components/context/session-artifacts").useSessionArtifacts
>;
type CanvasRunManagerApi = ReturnType<
  typeof import("@/components/assistant-ui/thread-graph-flow/use-canvas-run-manager").useCanvasRunManager
>;

export type CanvasFlowElementsParams = {
  artifacts: SessionArtifact[];
  artifactIndex: ReadonlyMap<string, SessionArtifact>;
  canvasConversationNodes: ThreadGraphNodeModel[];
  canvasLinks: SessionCanvasLink[];
  canvasPrompts: SessionArtifact[];
  cancelCanvasPrompt: CanvasRunManagerApi["cancelPrompt"];
  canvasDraftError: string | null;
  contextLinks: SessionArtifactsApi["contextLinks"];
  deleteArtifact: SessionArtifactsApi["deleteArtifact"];
  draft: GraphBranchIntent | null;
  draftAnchorNode: ThreadGraphNodeModel | null;
  draftBranchSpec: BranchSpec | null;
  draftContextCount: number;
  draftDetail: BranchOperationDetail | null;
  getArtifactsForTarget: SessionArtifactsApi["getArtifactsForTarget"];
  handleCancelPromptDraft: () => void;
  handleCancelRun: () => void;
  handleCutEdge: (childId: string, parentId: string | null) => void;
  handleSubmitBranchDraft: () => void;
  isSubmittingBranch: boolean;
  isThreadRunning: boolean;
  linkedTargetCountByArtifact: ReadonlyMap<string, number>;
  linkEditMode: boolean;
  llmEnabled: boolean;
  nodeIndex: ReadonlyMap<string, ThreadGraphNodeModel>;
  overrides: { has: (nodeId: string) => boolean };
  promptIndex: ReadonlyMap<string, SessionArtifact>;
  requestError: string | null;
  runCanvasPrompt: CanvasRunManagerApi["runPrompt"];
  setDraftText: (value: string) => void;
  updateArtifact: SessionArtifactsApi["updateArtifact"];
};

export type CanvasFlowElements = {
  conversationEdges: ThreadGraphFlowEdge[];
  edges: ThreadGraphFlowEdge[];
  nodes: ThreadGraphFlowNode[];
};

export type CanvasPromptLinkCount = {
  context: number;
  output: number;
};

export type CanvasFlowIndexes = {
  linkedArtifactCountByTarget: ReadonlyMap<string, number>;
  promptLinkCountById: ReadonlyMap<string, CanvasPromptLinkCount>;
};
