import type { SessionArtifact, SessionArtifactType } from "@/lib/session-artifacts";

type ArtifactLike = Pick<
  SessionArtifact,
  "artifactType" | "title" | "content" | "fileName" | "language" | "mimeType" | "byteSize"
>;

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

export const getArtifactReadableRole = (artifactType: SessionArtifactType) => {
  switch (artifactType) {
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

export const getArtifactIntentLabel = (artifactType: SessionArtifactType) => {
  switch (artifactType) {
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
  if (artifact.language) chips.push(artifact.language);
  if (artifact.fileName) chips.push(artifact.fileName);
  if (artifact.mimeType) chips.push(artifact.mimeType);
  const lineCount = getArtifactLineCount(artifact);
  if (artifact.artifactType === "code" && lineCount > 0) {
    chips.push(`${lineCount} line${lineCount === 1 ? "" : "s"}`);
  }
  return chips;
};
