import type { ProjectMemoryType } from "@/lib/memory-documents";

export const PROJECT_MEMORY_META: Record<
  ProjectMemoryType,
  {
    accent: string;
    description: string;
    label: string;
    shortLabel: string;
  }
> = {
  question: {
    accent: "#2563eb",
    description: "Open problems, unresolved asks, or prompts the project still needs to answer.",
    label: "Question",
    shortLabel: "Question node",
  },
  draft: {
    accent: "#7c3aed",
    description: "Early proposals, sketches, or candidate directions that are still in motion.",
    label: "Draft",
    shortLabel: "Draft node",
  },
  critique: {
    accent: "#dc2626",
    description: "Counterarguments, risks, and weaknesses that should pressure-test the work.",
    label: "Critique",
    shortLabel: "Critique node",
  },
  decision: {
    accent: "#ca8a04",
    description: "Committed choices, calls made, and guidance the project should now follow.",
    label: "Decision",
    shortLabel: "Decision node",
  },
  summary: {
    accent: "#0f766e",
    description: "Condensed synthesis that captures what matters without the full transcript.",
    label: "Summary",
    shortLabel: "Summary node",
  },
  evidence: {
    accent: "#0891b2",
    description: "Supporting proof, source-backed findings, or concrete observations worth preserving.",
    label: "Evidence",
    shortLabel: "Evidence node",
  },
  merge: {
    accent: "#d97706",
    description: "A synthesized merge of compared branches or sessions promoted from Arena.",
    label: "Merge",
    shortLabel: "Merge node",
  },
};

export const PROJECT_MEMORY_TYPE_ORDER: ProjectMemoryType[] = [
  "question",
  "draft",
  "critique",
  "decision",
  "summary",
  "evidence",
  "merge",
];

export const PROJECT_EDITABLE_MEMORY_TYPES: ProjectMemoryType[] =
  PROJECT_MEMORY_TYPE_ORDER.filter((type) => type !== "merge");

export const formatProjectMemoryTypeLabel = (type: ProjectMemoryType) =>
  PROJECT_MEMORY_META[type].label;
