"use client";

import type { Edge, Node } from "@xyflow/react";
import type { ProjectMemoryType } from "@/lib/memory-documents";
import type { SessionArtifactType } from "@/lib/session-artifacts";

export type ThreadGraphFlowNodeData = {
  accent?: string;
  artifactType?: SessionArtifactType | null;
  branchId?: string | number | null;
  byteSize?: number | null;
  depth?: number;
  emphasis?: "normal" | "selected" | "lineage" | "muted";
  editedFromId?: string | null;
  fileName?: string | null;
  filterMatched?: boolean;
  isBridge?: boolean;
  isCut?: boolean;
  isRoot?: boolean;
  kind?: "root" | "bridge" | "message" | "artifact";
  language?: string | null;
  linkedArtifactCount?: number;
  memoryId?: string | null;
  memoryType?: ProjectMemoryType | null;
  model?: string | null;
  modelLabel?: string;
  mimeType?: string | null;
  position?: { x: number; y: number } | null;
  preview: string;
  provider?: string | null;
  providerLabel?: string;
  role: string;
  idx?: number;
  messageId?: string | null;
  sessionId?: string | null;
  sessionTitle?: string | null;
  sourceDataUrl?: string | null;
  statusLabel?: string | null;
  title?: string | null;
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
  tone?: "default" | "bridge" | "context" | "edited";
};

export type ThreadGraphFlowNode = Node<ThreadGraphFlowNodeData>;
export type ThreadGraphFlowEdge = Edge<ThreadGraphFlowEdgeData>;
