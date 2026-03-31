export type SessionArtifactType = "text" | "code" | "image" | "file";

export type SessionArtifact = {
  id: string;
  title: string;
  artifactType: SessionArtifactType;
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
  byteSize?: number | null;
  content: string;
  fileName?: string | null;
  language?: string | null;
  mimeType?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isArtifactType = (value: unknown): value is SessionArtifactType =>
  value === "text" || value === "code" || value === "image" || value === "file";

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
    byteSize: artifact.byteSize ?? null,
    content: artifact.content,
    fileName: artifact.fileName ?? null,
    language: artifact.language ?? null,
    mimeType: artifact.mimeType ?? null,
  }));
