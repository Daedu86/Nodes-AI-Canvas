"use client";

import type { Edge, Node } from "@xyflow/react";
import type { ProjectMemoryType } from "@/lib/memory-documents";
import type {
  SessionArtifactSemanticType,
  SessionArtifactSyncMode,
  SessionCanvasPromptStatus,
  SessionArtifactType,
} from "@/lib/session-artifacts";
import type { BranchOperation, BranchOperationDetail } from "@/lib/thread-branching";

export type ThreadGraphFlowNodeData = {
  accent?: string;
  artifactType?: SessionArtifactType | null;
  branchId?: string | number | null;
  byteSize?: number | null;
  depth?: number;
  draftBusy?: boolean;
  draftContextCount?: number;
  draftOutputCount?: number;
  draftDetail?: BranchOperationDetail | null;
  draftDisabled?: boolean;
  draftError?: string | null;
  draftOperation?: BranchOperation | null;
  draftRunInterruptionNote?: string | null;
  draftText?: string;
  emphasis?: "normal" | "selected" | "lineage" | "muted";
  editedFromId?: string | null;
  fileName?: string | null;
  filterMatched?: boolean;
  isBridge?: boolean;
  isCut?: boolean;
  isRoot?: boolean;
  kind?: "root" | "bridge" | "message" | "artifact" | "prompt-draft" | "canvas-prompt";
  language?: string | null;
  linkedArtifactCount?: number;
  memoryId?: string | null;
  memoryType?: ProjectMemoryType | null;
  model?: string | null;
  modelLabel?: string;
  mimeType?: string | null;
  semanticType?: SessionArtifactSemanticType | null;
  position?: { x: number; y: number } | null;
  promptResult?: string | null;
  promptStatus?: SessionCanvasPromptStatus | null;
  preview: string;
  provider?: string | null;
  providerLabel?: string;
  revisionCount?: number;
  role: string;
  idx?: number;
  messageId?: string | null;
  sessionId?: string | null;
  sessionTitle?: string | null;
  sourceDataUrl?: string | null;
  statusLabel?: string | null;
  syncMode?: SessionArtifactSyncMode;
  title?: string | null;
  onDraftCancel?: () => void;
  onDraftCancelRun?: () => void;
  onDraftSubmit?: () => void;
  onDraftTextChange?: (value: string) => void;
};

export type ThreadGraphFlowEdgeData = {
  accent?: string;
  editable?: boolean;
  emphasis?: "normal" | "selected" | "lineage" | "muted";
  isBridge?: boolean;
  isEdited?: boolean;
  label?: string;
  linkEditMode?: boolean;
  onCut?: () => void;
  tone?:
    | "default"
    | "bridge"
    | "context"
    | "edited"
    | "draft"
    | "output"
    | "pending-output";
};

export type ThreadGraphFlowNode = Node<ThreadGraphFlowNodeData>;
export type ThreadGraphFlowEdge = Edge<ThreadGraphFlowEdgeData>;
