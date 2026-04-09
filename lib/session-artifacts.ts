export type SessionArtifactType = "text" | "code" | "image" | "file";
export type SessionArtifactSemanticType =
  | "decision"
  | "evidence"
  | "plan"
  | "question"
  | "draft";

export type SessionArtifact = {
  id: string;
  title: string;
  artifactType: SessionArtifactType;
  semanticType?: SessionArtifactSemanticType | null;
  blobRef?: string | null;
  byteSize?: number | null;
  content: string;
  fileName?: string | null;
  language?: string | null;
  mimeType?: string | null;
  position?: {
    x: number;
    y: number;
  } | null;
  sourceDataUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionContextLink = {
  id: string;
  artifactId: string;
  targetMessageId: string;
  createdAt: string;
};

export type LlmContextArtifact = {
  id: string;
  title: string;
  artifactType: SessionArtifactType;
  semanticType?: SessionArtifactSemanticType | null;
  byteSize?: number | null;
  content: string;
  fileName?: string | null;
  language?: string | null;
  mimeType?: string | null;
};

const semanticArtifactLabels: Record<SessionArtifactSemanticType, string> = {
  decision: "Decision",
  evidence: "Evidence",
  plan: "Plan",
  question: "Question",
  draft: "Draft",
};

const semanticArtifactRoles: Record<SessionArtifactSemanticType, string> = {
  decision: "Recommendation and rationale",
  evidence: "Grounded facts and supporting observations",
  plan: "Execution steps and dependencies",
  question: "Open question worth resolving",
  draft: "Working language or unfinished copy",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isArtifactType = (value: unknown): value is SessionArtifactType =>
  value === "text" || value === "code" || value === "image" || value === "file";

const isArtifactSemanticType = (value: unknown): value is SessionArtifactSemanticType =>
  value === "decision" ||
  value === "evidence" ||
  value === "plan" ||
  value === "question" ||
  value === "draft";

const normalizePosition = (value: unknown) => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record.x === "number" && typeof record.y === "number"
    ? { x: record.x, y: record.y }
    : null;
};

const normalizeNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeNullableString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const trimArtifactText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

export const normalizeSessionArtifacts = (value: unknown): SessionArtifact[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null;
    const title = typeof entry.title === "string" && entry.title.trim().length > 0
      ? entry.title.trim()
      : null;
    const artifactType = isArtifactType(entry.artifactType) ? entry.artifactType : null;
    const content = typeof entry.content === "string" ? entry.content : "";
    if (!id || !title || !artifactType) return [];

    return [{
      id,
      title,
      artifactType,
      semanticType: isArtifactSemanticType(entry.semanticType) ? entry.semanticType : null,
      blobRef: normalizeNullableString(entry.blobRef),
      content,
      fileName: normalizeNullableString(entry.fileName),
      language:
        typeof entry.language === "string" && entry.language.trim().length > 0
          ? entry.language.trim()
          : null,
      mimeType: normalizeNullableString(entry.mimeType),
      byteSize: normalizeNullableNumber(entry.byteSize),
      position: normalizePosition(entry.position),
      sourceDataUrl:
        typeof entry.sourceDataUrl === "string" && entry.sourceDataUrl.length > 0
          ? entry.sourceDataUrl
          : null,
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.length > 0
          ? entry.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.length > 0
          ? entry.updatedAt
          : new Date().toISOString(),
    } satisfies SessionArtifact];
  });
};

export const normalizeSessionContextLinks = (value: unknown): SessionContextLink[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null;
    const artifactId =
      typeof entry.artifactId === "string" && entry.artifactId.length > 0 ? entry.artifactId : null;
    const targetMessageId =
      typeof entry.targetMessageId === "string" && entry.targetMessageId.length > 0
        ? entry.targetMessageId
        : null;
    if (!id || !artifactId || !targetMessageId) return [];

    return [{
      id,
      artifactId,
      targetMessageId,
      createdAt:
        typeof entry.createdAt === "string" && entry.createdAt.length > 0
          ? entry.createdAt
          : new Date().toISOString(),
    } satisfies SessionContextLink];
  });
};

export const getArtifactsForTarget = (
  artifacts: SessionArtifact[],
  contextLinks: SessionContextLink[],
  targetMessageId: string,
) => {
  const linkedIds = new Set(
    contextLinks
      .filter((link) => link.targetMessageId === targetMessageId)
      .map((link) => link.artifactId),
  );
  return artifacts.filter((artifact) => linkedIds.has(artifact.id));
};

export const toLlmContextArtifacts = (artifacts: SessionArtifact[]): LlmContextArtifact[] =>
  artifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    artifactType: artifact.artifactType,
    semanticType: artifact.semanticType ?? null,
    byteSize: artifact.byteSize ?? null,
    content: artifact.content,
    fileName: artifact.fileName ?? null,
    language: artifact.language ?? null,
    mimeType: artifact.mimeType ?? null,
  }));

export const normalizeLlmContextArtifacts = (value: unknown): LlmContextArtifact[] =>
  normalizeSessionArtifacts(value).map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    artifactType: artifact.artifactType,
    semanticType: artifact.semanticType ?? null,
    byteSize: artifact.byteSize ?? null,
    content: artifact.content,
    fileName: artifact.fileName ?? null,
    language: artifact.language ?? null,
    mimeType: artifact.mimeType ?? null,
  }));

export const getSemanticArtifactLabel = (
  semanticType?: SessionArtifactSemanticType | null,
) => (semanticType ? semanticArtifactLabels[semanticType] : null);

export const getSemanticArtifactRole = (
  semanticType?: SessionArtifactSemanticType | null,
) => (semanticType ? semanticArtifactRoles[semanticType] : null);

export const getSessionArtifactDisplayLabel = (
  artifact:
    | Pick<SessionArtifact, "artifactType" | "semanticType">
    | LlmContextArtifact,
) => {
  if (artifact.artifactType === "text" && artifact.semanticType) {
    return getSemanticArtifactLabel(artifact.semanticType) ?? "Text";
  }
  switch (artifact.artifactType) {
    case "code":
      return "Code";
    case "image":
      return "Image";
    case "file":
      return "File";
    default:
      return "Text";
  }
};

export const getSessionArtifactPreview = (
  artifact: Pick<
    SessionArtifact,
    "artifactType" | "content" | "fileName" | "semanticType" | "title"
  >,
  maxLength = 220,
) => {
  if (artifact.content.trim().length > 0) {
    return trimArtifactText(artifact.content, maxLength);
  }
  if (artifact.fileName) {
    return `${getSessionArtifactDisplayLabel(artifact)} · ${artifact.fileName}`;
  }
  return artifact.title?.trim() || `${getSessionArtifactDisplayLabel(artifact)} artifact`;
};
