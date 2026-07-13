import type { ProjectCanvasSelection } from "@/components/workspace/project-canvas";
import type { ProjectArenaBranchEntry } from "@/lib/project-arena";
import type { ProjectDocument } from "@/lib/project-documents";
import type { SessionDocument } from "@/lib/session-documents";

export const formatProjectTitle = (title: string | null) =>
  title?.trim() || "Untitled Project";

export const formatSessionTitle = (title: string | null) =>
  title?.trim() || "Untitled Session";

export const formatMemoryTitle = (title: string) =>
  title.trim() || "Untitled Memory";

export const formatProjectWinnerLabel = ({
  branchCatalog,
  memberSessions,
  project,
}: {
  branchCatalog: ProjectArenaBranchEntry[];
  memberSessions: SessionDocument[];
  project: ProjectDocument;
}) => {
  if (project.arenaWinnerBranchKey) {
    return (
      branchCatalog.find((entry) => entry.key === project.arenaWinnerBranchKey)?.title ??
      "Branch winner"
    );
  }
  if (project.arenaWinnerSessionId) {
    return (
      memberSessions
        .find((session) => session.id === project.arenaWinnerSessionId)
        ?.title?.trim() || "Session winner"
    );
  }
  return "Not set";
};

export const formatUpdatedAt = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const summarizePreviewText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const summarizeSelectionForTypedNode = (
  selection: ProjectCanvasSelection,
) => {
  if (!selection) return "";
  const prefix =
    selection.kind === "edge"
      ? `Canvas branch: ${selection.label}`
      : `Canvas focus: ${selection.label}`;
  return `${prefix}\n\n${selection.preview}`.trim();
};
