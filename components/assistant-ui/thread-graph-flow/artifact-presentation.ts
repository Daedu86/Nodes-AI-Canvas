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

const descriptorOf = (value: ArtifactDescriptor) =>
  typeof value === "string"
    ? { artifactType: value, semanticType: null as SessionArtifactSemanticType | null }
    : value;

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

export const getArtifactReadableRole = (value: ArtifactDescriptor) => {
  const descriptor = descriptorOf(value);
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision": return "Decision call";
      case "evidence": return "Evidence set";
      case "plan": return "Execution plan";
      case "table": return "Structured table";
      case "question": return "Open question";
      case "draft": return "Working draft";
      default: return "Reusable context";
    }
  }
  switch (descriptor.artifactType) {
    case "code": return "Executable block";
    case "image": return "Visual evidence";
    case "file": return "Attached source";
    case "prompt": return "Independent LLM instruction";
    default: return "Reusable context";
  }
};

export const getArtifactIntentLabel = (value: ArtifactDescriptor) => {
  const descriptor = descriptorOf(value);
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision": return "Captures the recommendation, rationale, risks, and alternatives.";
      case "evidence": return "Captures claims, observations, sources, and why they matter.";
      case "plan": return "Captures ordered steps, dependencies, and verification criteria.";
      case "table": return "Captures consistent rows and columns with the original text as fallback.";
      case "question": return "Keeps an unresolved question visible and actionable.";
      case "draft": return "Keeps working copy or unfinished language available.";
      default: return "Provides stable narrative context to a prompt.";
    }
  }
  switch (descriptor.artifactType) {
    case "code": return "Provides exact syntax or implementation detail.";
    case "image": return "Provides visual context and a human-readable note.";
    case "file": return "Provides an uploaded source file plus extracted notes.";
    case "prompt": return "Runs an independent LLM instruction with connected inputs and outputs.";
    default: return "Provides stable narrative context to a prompt.";
  }
};

export const getArtifactBadgeLabel = (value: ArtifactDescriptor) => {
  const descriptor = descriptorOf(value);
  if (descriptor.artifactType === "text") {
    switch (descriptor.semanticType) {
      case "decision": return "Decision";
      case "evidence": return "Evidence";
      case "plan": return "Plan";
      case "table": return "Table";
      case "question": return "Question";
      case "draft": return "Draft";
      default: return "Text";
    }
  }
  switch (descriptor.artifactType) {
    case "code": return "Code";
    case "image": return "Image";
    case "file": return "File";
    case "prompt": return "Prompt";
    default: return "Text";
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
  return trimmed ? trimmed.split(/\r?\n/).length : 0;
};

export const getArtifactStatChips = (artifact: ArtifactLike) => {
  const chips: string[] = [];
  if (artifact.artifactType === "text" && artifact.semanticType) chips.push(getArtifactBadgeLabel(artifact));
  if (artifact.language) chips.push(artifact.language);
  if (artifact.fileName) chips.push(artifact.fileName);
  if (artifact.mimeType) chips.push(artifact.mimeType);
  const lineCount = getArtifactLineCount(artifact);
  if ((artifact.artifactType === "code" || artifact.semanticType === "table") && lineCount > 0) {
    chips.push(`${lineCount} line${lineCount === 1 ? "" : "s"}`);
  }
  return chips;
};
