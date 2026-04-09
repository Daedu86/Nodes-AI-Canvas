import type {
  SessionArtifact,
  SessionArtifactSemanticType,
  SessionArtifactType,
} from "@/lib/session-artifacts";

type ArtifactLike = Pick<
  SessionArtifact,
  | "artifactType"
  | "semanticType"
  | "title"
  | "content"
  | "fileName"
  | "language"
  | "mimeType"
  | "byteSize"
>;

type ArtifactDescriptor =
  | SessionArtifactType
  | Pick<SessionArtifact, "artifactType" | "semanticType">;

const stripMarkdownNoise = (value: string) =>
  value
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^#+\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/`/g, "")
    .trim();

const normalizeArtifactLines = (content: string) =>
  content
    .split(/\r?\n/)
    .map((line) => stripMarkdownNoise(line))
    .filter((line) => line.length > 0);

export const getArtifactReadableRole = (artifactType: ArtifactDescriptor) => {
  const descriptor =
    typeof artifactType === "string"
      ? { artifactType, semanticType: null as SessionArtifactSemanticType | null }
      : artifactType;
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision":
        return "Decision call";
      case "evidence":
        return "Evidence set";
      case "plan":
        return "Execution plan";
      case "question":
        return "Open question";
      case "draft":
        return "Working draft";
      default:
        return "Reusable brief";
    }
  }
  switch (descriptor.artifactType) {
    case "code":
      return "Executable block";
    case "image":
      return "Visual evidence";
    case "file":
      return "Attached source";
    default:
      return "Reusable brief";
  }
};

export const getArtifactIntentLabel = (artifactType: ArtifactDescriptor) => {
  const descriptor =
    typeof artifactType === "string"
      ? { artifactType, semanticType: null as SessionArtifactSemanticType | null }
      : artifactType;
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision":
        return "Use this when the model needs the current recommendation plus rationale.";
      case "evidence":
        return "Use this when the model needs grounded facts, references, or source-backed observations.";
      case "plan":
        return "Use this when the model needs ordered steps, milestones, or execution structure.";
      case "question":
        return "Use this when the model should keep an unresolved question visible and actionable.";
      case "draft":
        return "Use this when the model needs working copy, rough language, or a message in progress.";
      default:
        return "Use this when the model needs stable narrative context.";
    }
  }
  switch (descriptor.artifactType) {
    case "code":
      return "Use this when the model needs exact syntax or implementation detail.";
    case "image":
      return "Use this when the model needs a human-readable read of an image.";
    case "file":
      return "Use this when the model needs a source file plus extracted notes.";
    default:
      return "Use this when the model needs stable narrative context.";
  }
};

export const getArtifactBadgeLabel = (artifact: ArtifactDescriptor) => {
  const descriptor =
    typeof artifact === "string"
      ? { artifactType: artifact, semanticType: null as SessionArtifactSemanticType | null }
      : artifact;
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision":
        return "Decision";
      case "evidence":
        return "Evidence";
      case "plan":
        return "Plan";
      case "question":
        return "Question";
      case "draft":
        return "Draft";
      default:
        return "Text context";
    }
  }
  switch (descriptor.artifactType) {
    case "code":
      return "Code context";
    case "image":
      return "Image context";
    case "file":
      return "File context";
    default:
      return "Text context";
  }
};

export const getArtifactHeadline = (artifact: ArtifactLike) => {
  const [firstLine] = normalizeArtifactLines(artifact.content);
  if (firstLine) return firstLine;
  if (artifact.fileName) return artifact.fileName;
  return artifact.title?.trim() || "Untitled artifact";
};

export const getArtifactHighlights = (artifact: ArtifactLike, limit = 3) => {
  const lines = normalizeArtifactLines(artifact.content);
  const rest = lines.slice(lines.length > 0 ? 1 : 0);
  if (rest.length > 0) return rest.slice(0, limit);
  if (lines.length > 0) return lines.slice(0, limit);
  if (artifact.mimeType) return [artifact.mimeType];
  return [];
};

export const getArtifactCodeSample = (artifact: ArtifactLike, limit = 5) =>
  artifact.content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, limit);

export const getArtifactLineCount = (artifact: ArtifactLike) => {
  const trimmed = artifact.content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/).length;
};

export const getArtifactStatChips = (artifact: ArtifactLike) => {
  const chips: string[] = [];
  if (artifact.artifactType === "text" && artifact.semanticType) {
    chips.push(getArtifactBadgeLabel(artifact));
  }
  if (artifact.language) chips.push(artifact.language);
  if (artifact.fileName) chips.push(artifact.fileName);
  if (artifact.mimeType) chips.push(artifact.mimeType);
  const lineCount = getArtifactLineCount(artifact);
  if (artifact.artifactType === "code" && lineCount > 0) {
    chips.push(`${lineCount} line${lineCount === 1 ? "" : "s"}`);
  }
  return chips;
};
