"use client";

import type { Viewport } from "@xyflow/react";
import {
  BadgeHelp,
  Crosshair,
  ListTodo,
  NotebookPen,
  Scale,
} from "lucide-react";
import React from "react";
import { getArtifactBadgeLabel } from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import type {
  SessionArtifact,
  SessionArtifactSemanticType,
} from "@/lib/session-artifacts";
import { getProviderLabel } from "@/lib/llm/provider-catalog";

export const CANVAS_PROMPT_DRAFT_NODE_ID = "__CANVAS_PROMPT_DRAFT__";

export const CANVAS_BRANCH_RUN_NOTICE =
  "Submitting will stop the current run before creating the branch.";
export const CANVAS_BRANCH_CANCEL_FAILURE =
  "The current assistant run could not be cancelled. Wait for it to finish, then try again.";

export type FlowSpotlightMode = "all" | "assistant" | "user" | "bridge" | "edited";
export type FlowDensityMode = "overview" | "focus";
export type FlowRenderMode = "2d" | "3d";

export const flowFilterLabel: Record<FlowSpotlightMode, string> = {
  all: "All",
  assistant: "Assistant",
  user: "User",
  bridge: "Bridge",
  edited: "Edited",
};

export const canvasToolbarIconButtonClassName =
  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/92 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground";

export const providerDisplay = (provider?: string | null) => {
  if (!provider) return undefined;
  return getProviderLabel(provider);
};

export const scrollMessageIntoView = (messageId: string, attemptsRemaining = 8) => {
  if (typeof document === "undefined") return;
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (attemptsRemaining <= 0 || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    scrollMessageIntoView(messageId, attemptsRemaining - 1);
  });
};

const semanticArtifactMeta: Record<
  SessionArtifactSemanticType,
  {
    accent: string;
    icon: typeof Scale;
    label: string;
    placeholder: string;
    role: string;
    titlePrefix: string;
  }
> = {
  decision: {
    accent: "#d97706",
    icon: Scale,
    label: "Decision",
    placeholder: "Decision\nRationale\nRisks\nWhat changes if we choose differently?",
    role: "Recommendation and rationale",
    titlePrefix: "Decision",
  },
  evidence: {
    accent: "#0284c7",
    icon: Crosshair,
    label: "Evidence",
    placeholder: "Claim\nSource\nObservation\nWhy it matters",
    role: "Grounded facts and source notes",
    titlePrefix: "Evidence",
  },
  plan: {
    accent: "#0f766e",
    icon: ListTodo,
    label: "Plan",
    placeholder: "Goal\nSteps\nDependencies\nStatus",
    role: "Execution structure and next steps",
    titlePrefix: "Plan",
  },
  table: {
    accent: "#0891b2",
    icon: ListTodo,
    label: "Table",
    placeholder: "| Column | Value |\n| --- | --- |\n| Example | Ready |",
    role: "Structured rows and columns",
    titlePrefix: "Table",
  },
  question: {
    accent: "#db2777",
    icon: BadgeHelp,
    label: "Question",
    placeholder: "Open question\nWhy it is unresolved\nWhat would answer it",
    role: "Unresolved question worth tracking",
    titlePrefix: "Question",
  },
  draft: {
    accent: "#7c3aed",
    icon: NotebookPen,
    label: "Draft",
    placeholder: "Working draft\nAudience\nMessage goal\nNotes",
    role: "Working language or copy in progress",
    titlePrefix: "Draft",
  },
};

export const getSemanticArtifactMeta = (
  semanticType?: SessionArtifactSemanticType | null,
) => (semanticType ? semanticArtifactMeta[semanticType] : null);

export const semanticArtifactPresets = (
  Object.keys(semanticArtifactMeta) as SessionArtifactSemanticType[]
).map((semanticType) => ({ semanticType }));

export const artifactAccent = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
  semanticType?: SessionArtifactSemanticType | null,
) => {
  const descriptor =
    typeof artifact === "string"
      ? { artifactType: artifact, semanticType: semanticType ?? null }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return getSemanticArtifactMeta(descriptor.semanticType)?.accent ?? "#7c3aed";
  }
  switch (descriptor.artifactType) {
    case "code":
      return "#0f766e";
    case "image":
      return "#db2777";
    case "file":
      return "#2563eb";
    case "prompt":
      return "#0f766e";
    default:
      return "#7c3aed";
  }
};

export const artifactTypeLabel = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => getArtifactBadgeLabel(artifact);

export const artifactDefaultTitle = (
  artifactType: SessionArtifact["artifactType"],
  existingArtifacts: SessionArtifact[],
  semanticType?: SessionArtifactSemanticType | null,
) => {
  const count =
    existingArtifacts.filter(
      (artifact) =>
        artifact.artifactType === artifactType &&
        (artifactType !== "text" ||
          (artifact.semanticType ?? null) === (semanticType ?? null)),
    ).length + 1;
  const semanticMeta =
    artifactType === "text" ? getSemanticArtifactMeta(semanticType) : null;
  switch (artifactType) {
    case "code":
      return `Code Context ${count}`;
    case "image":
      return `Image Context ${count}`;
    case "file":
      return `File Context ${count}`;
    case "prompt":
      return `Prompt ${count}`;
    default:
      return `${semanticMeta?.titlePrefix ?? "Text Context"} ${count}`;
  }
};

export const artifactContentLabel = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => {
  const descriptor =
    typeof artifact === "string"
      ? {
          artifactType: artifact,
          semanticType: null as SessionArtifactSemanticType | null,
        }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return `${getSemanticArtifactMeta(descriptor.semanticType)?.label ?? "Text"} notes`;
  }
  switch (descriptor.artifactType) {
    case "image":
      return "Notes";
    case "file":
      return "Extracted text / notes";
    case "prompt":
      return "Prompt";
    default:
      return "Content";
  }
};

export const artifactContentPlaceholder = (
  artifact:
    | SessionArtifact["artifactType"]
    | Pick<SessionArtifact, "artifactType" | "semanticType">,
) => {
  const descriptor =
    typeof artifact === "string"
      ? {
          artifactType: artifact,
          semanticType: null as SessionArtifactSemanticType | null,
        }
      : artifact;
  if (descriptor.artifactType === "text" && descriptor.semanticType) {
    return (
      getSemanticArtifactMeta(descriptor.semanticType)?.placeholder ??
      "Write reusable context here..."
    );
  }
  switch (descriptor.artifactType) {
    case "code":
      return "Paste code or config here...";
    case "image":
      return "Describe what matters about this image...";
    case "file":
      return "Review or refine the extracted file text here...";
    case "prompt":
      return "Write an independent model instruction...";
    default:
      return "Write reusable context here...";
  }
};

export const formatByteSize = (byteSize?: number | null) => {
  if (!byteSize || byteSize <= 0) return null;
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(byteSize >= 10 * 1024 ? 0 : 1)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

export const trimArtifactPreview = (
  artifact: Pick<SessionArtifact, "artifactType" | "content" | "fileName">,
) => {
  const compact = artifact.content.replace(/\s+/g, " ").trim();
  if (compact.length > 0) return compact;
  if (artifact.artifactType === "image") {
    return artifact.fileName ? `Image: ${artifact.fileName}` : "Image artifact";
  }
  if (artifact.artifactType === "file") {
    return artifact.fileName ? `File: ${artifact.fileName}` : "File artifact";
  }
  return "Empty artifact";
};

export const LegendItem = ({
  color,
  label,
}: {
  color: string;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
    <span
      className="h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color }}
    />
    <span>{label}</span>
  </span>
);

export const isFlowViewport = (
  value: Viewport | null,
): value is Viewport =>
  !!value &&
  typeof value.x === "number" &&
  typeof value.y === "number" &&
  typeof value.zoom === "number";

export const readFlowRenderMode = (
  storageKey: string,
): FlowRenderMode => {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "3d") return "3d";
    return "2d";
  } catch {
    return "2d";
  }
};
