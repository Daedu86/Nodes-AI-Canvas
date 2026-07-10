export type SessionArtifactType = "text" | "code" | "image" | "file";
export type SessionArtifactSemanticType =
  | "decision"
  | "evidence"
  | "plan"
  | "table"
  | "question"
  | "draft";
export type SessionArtifactSyncMode = "auto" | "paused";
export type SessionArtifactRevisionAuthor = "model" | "user";
export type SessionArtifactRevisionOrigin = "automatic" | "manual" | "restore";

export type SessionArtifactRevision = {
  id: string;
  content: string;
  origin: SessionArtifactRevisionOrigin;
  createdAt: string;
  author: SessionArtifactRevisionAuthor;
  promptId?: string | null;
  responseId?: string | null;
};

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
  syncMode?: SessionArtifactSyncMode;
  revisions?: SessionArtifactRevision[];
  createdAt: string;
  updatedAt: string;
};

export type SessionCanvasLinkRelation = "context" | "output";

export type SessionCanvasLink = {
  id: string;
  relation: SessionCanvasLinkRelation;
  artifactId: string;
  promptId?: string | null;
  responseId?: string | null;
  /** @deprecated Alias for promptId on context links. */
  targetMessageId?: string | null;
  createdAt: string;
};

export type LegacySessionContextLink = {
  id: string;
  artifactId: string;
  targetMessageId: string;
  createdAt: string;
  relation?: undefined;
  promptId?: undefined;
  responseId?: undefined;
};

/** @deprecated Sessions are normalized into SessionCanvasLink. */
export type SessionContextLink = SessionCanvasLink | LegacySessionContextLink;

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

export type SessionCanvasEndpoint = {
  id: string;
  kind: "artifact" | "prompt" | "response" | "draft";
};

export type SessionCanvasLinkValidation =
  | { ok: true; link: Omit<SessionCanvasLink, "id" | "createdAt"> }
  | {
      ok: false;
      reason: "duplicate" | "inverse" | "self" | "incompatible" | "missing";
      message: string;
    };

export const MAX_ARTIFACT_REVISIONS = 20;

const semanticArtifactLabels: Record<SessionArtifactSemanticType, string> = {
  decision: "Decision",
  evidence: "Evidence",
  plan: "Plan",
  table: "Table",
  question: "Question",
  draft: "Draft",
};

const semanticArtifactRoles: Record<SessionArtifactSemanticType, string> = {
  decision: "Recommendation and rationale",
  evidence: "Grounded facts and supporting observations",
  plan: "Execution steps and dependencies",
  table: "Structured rows and columns",
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
  value === "table" ||
  value === "question" ||
  value === "draft";

const isSyncMode = (value: unknown): value is SessionArtifactSyncMode =>
  value === "auto" || value === "paused";

const isRevisionAuthor = (value: unknown): value is SessionArtifactRevisionAuthor =>
  value === "model" || value === "user";

const isRevisionOrigin = (value: unknown): value is SessionArtifactRevisionOrigin =>
  value === "automatic" || value === "manual" || value === "restore";

const normalizePosition = (value: unknown) => {
  if (!isRecord(value)) return null;
  return typeof value.x === "number" && typeof value.y === "number"
    ? { x: value.x, y: value.y }
    : null;
};

const normalizeNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeNullableString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeTimestamp = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const createStableFallbackId = (prefix: string, index: number, timestamp: string) =>
  `${prefix}-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}-${index}`;

const normalizeRevision = (
  value: unknown,
  index: number,
  fallbackTimestamp: string,
): SessionArtifactRevision | null => {
  if (!isRecord(value) || typeof value.content !== "string") return null;
  const createdAt = normalizeTimestamp(value.createdAt, fallbackTimestamp);
  return {
    id:
      typeof value.id === "string" && value.id.length > 0
        ? value.id
        : createStableFallbackId("revision", index, createdAt),
    content: value.content,
    origin: isRevisionOrigin(value.origin) ? value.origin : "manual",
    createdAt,
    author: isRevisionAuthor(value.author) ? value.author : "user",
    promptId: normalizeNullableString(value.promptId),
    responseId: normalizeNullableString(value.responseId),
  };
};

export const limitArtifactRevisions = (revisions: SessionArtifactRevision[]) =>
  revisions.slice(-MAX_ARTIFACT_REVISIONS);

export const normalizeSessionArtifactRevisions = (
  value: unknown,
  fallbackTimestamp = new Date().toISOString(),
): SessionArtifactRevision[] => {
  if (!Array.isArray(value)) return [];
  return limitArtifactRevisions(
    value.flatMap((entry, index) => {
      const revision = normalizeRevision(entry, index, fallbackTimestamp);
      return revision ? [revision] : [];
    }),
  );
};

export const normalizeSessionArtifacts = (value: unknown): SessionArtifact[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null;
    const title =
      typeof entry.title === "string" && entry.title.trim().length > 0
        ? entry.title.trim()
        : null;
    const artifactType = isArtifactType(entry.artifactType) ? entry.artifactType : null;
    const content = typeof entry.content === "string" ? entry.content : "";
    if (!id || !title || !artifactType) return [];
    const createdAt = normalizeTimestamp(entry.createdAt, new Date().toISOString());
    const updatedAt = normalizeTimestamp(entry.updatedAt, createdAt);

    return [
      {
        id,
        title,
        artifactType,
        semanticType: isArtifactSemanticType(entry.semanticType) ? entry.semanticType : null,
        blobRef: normalizeNullableString(entry.blobRef),
        content,
        fileName: normalizeNullableString(entry.fileName),
        language: normalizeNullableString(entry.language),
        mimeType: normalizeNullableString(entry.mimeType),
        byteSize: normalizeNullableNumber(entry.byteSize),
        position: normalizePosition(entry.position),
        sourceDataUrl:
          typeof entry.sourceDataUrl === "string" && entry.sourceDataUrl.length > 0
            ? entry.sourceDataUrl
            : null,
        syncMode: isSyncMode(entry.syncMode) ? entry.syncMode : "auto",
        revisions: normalizeSessionArtifactRevisions(entry.revisions, updatedAt),
        createdAt,
        updatedAt,
      } satisfies SessionArtifact,
    ];
  });
};

const normalizeCanvasRelation = (value: unknown): SessionCanvasLinkRelation | null =>
  value === "context" || value === "output" ? value : null;

export const normalizeSessionCanvasLinks = (value: unknown): SessionCanvasLink[] => {
  if (!Array.isArray(value)) return [];

  const normalized = value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const artifactId = normalizeNullableString(entry.artifactId);
    const legacyTargetMessageId = normalizeNullableString(entry.targetMessageId);
    const relation = normalizeCanvasRelation(entry.relation) ?? (legacyTargetMessageId ? "context" : null);
    const promptId = normalizeNullableString(entry.promptId) ?? legacyTargetMessageId;
    const responseId = normalizeNullableString(entry.responseId);
    if (!artifactId || !relation) return [];
    if (relation === "context" && !promptId) return [];
    if (relation === "output" && !promptId && !responseId) return [];
    const createdAt = normalizeTimestamp(entry.createdAt, new Date().toISOString());
    return [
      {
        id:
          typeof entry.id === "string" && entry.id.length > 0
            ? entry.id
            : createStableFallbackId("canvas-link", index, createdAt),
        relation,
        artifactId,
        promptId,
        responseId,
        targetMessageId: relation === "context" ? promptId : null,
        createdAt,
      } satisfies SessionCanvasLink,
    ];
  });

  const seen = new Set<string>();
  return normalized.filter((link) => {
    const key = `${link.relation}:${link.artifactId}:${link.promptId ?? ""}:${link.responseId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** @deprecated Use normalizeSessionCanvasLinks. */
export const normalizeSessionContextLinks = normalizeSessionCanvasLinks;

export const getContextLinks = (links: SessionCanvasLink[]) =>
  links.filter((link) => link.relation === "context");

export const getOutputLinks = (links: SessionCanvasLink[]) =>
  links.filter((link) => link.relation === "output");

export const getArtifactsForTarget = (
  artifacts: SessionArtifact[],
  links: SessionCanvasLink[],
  promptId: string,
) => {
  const linkedIds = new Set(
    links
      .filter((link) => link.relation === "context" && link.promptId === promptId)
      .map((link) => link.artifactId),
  );
  return artifacts.filter((artifact) => linkedIds.has(artifact.id));
};

const endpointPairKey = (source: SessionCanvasEndpoint, target: SessionCanvasEndpoint) =>
  `${source.kind}:${source.id}->${target.kind}:${target.id}`;

export const validateSessionCanvasConnection = ({
  source,
  target,
  links,
}: {
  source: SessionCanvasEndpoint | null | undefined;
  target: SessionCanvasEndpoint | null | undefined;
  links: SessionCanvasLink[];
}): SessionCanvasLinkValidation => {
  if (!source || !target) {
    return { ok: false, reason: "missing", message: "Choose both ends of the connection." };
  }
  if (source.id === target.id) {
    return { ok: false, reason: "self", message: "A block cannot connect to itself." };
  }

  let candidate: Omit<SessionCanvasLink, "id" | "createdAt"> | null = null;
  if (source.kind === "artifact" && (target.kind === "prompt" || target.kind === "draft")) {
    candidate = {
      relation: "context",
      artifactId: source.id,
      promptId: target.id,
      responseId: null,
      targetMessageId: target.id,
    };
  } else if (
    (source.kind === "prompt" || source.kind === "draft" || source.kind === "response") &&
    target.kind === "artifact"
  ) {
    candidate = {
      relation: "output",
      artifactId: target.id,
      promptId: source.kind === "response" ? null : source.id,
      responseId: source.kind === "response" ? source.id : null,
      targetMessageId: null,
    };
  }

  if (!candidate) {
    const inverseAllowed =
      (target.kind === "artifact" && (source.kind === "prompt" || source.kind === "draft")) ||
      (source.kind === "artifact" && target.kind === "response");
    return {
      ok: false,
      reason: inverseAllowed ? "inverse" : "incompatible",
      message: inverseAllowed
        ? "Reverse this connection to match the block flow."
        : `Incompatible connection: ${endpointPairKey(source, target)}.`,
    };
  }

  const duplicate = links.some(
    (link) =>
      link.relation === candidate?.relation &&
      link.artifactId === candidate?.artifactId &&
      (link.promptId ?? null) === (candidate?.promptId ?? null) &&
      (link.responseId ?? null) === (candidate?.responseId ?? null),
  );
  if (duplicate) {
    return { ok: false, reason: "duplicate", message: "This connection already exists." };
  }

  return { ok: true, link: candidate };
};

const makeRevisionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `revision-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const appendArtifactRevision = (
  artifact: SessionArtifact,
  input: Omit<SessionArtifactRevision, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): SessionArtifact => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const revision: SessionArtifactRevision = {
    id: input.id ?? makeRevisionId(),
    content: input.content,
    origin: input.origin,
    createdAt,
    author: input.author,
    promptId: input.promptId ?? null,
    responseId: input.responseId ?? null,
  };
  return {
    ...artifact,
    content: input.content,
    revisions: limitArtifactRevisions([...(artifact.revisions ?? []), revision]),
    updatedAt: createdAt,
  };
};

export const restoreArtifactRevision = (
  artifact: SessionArtifact,
  revisionId: string,
  createdAt = new Date().toISOString(),
): SessionArtifact => {
  const revision = artifact.revisions?.find((entry) => entry.id === revisionId);
  if (!revision) return artifact;
  return appendArtifactRevision(artifact, {
    content: revision.content,
    origin: "restore",
    author: "user",
    createdAt,
    promptId: revision.promptId ?? null,
    responseId: revision.responseId ?? null,
  });
};

const trimArtifactText = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No preview available.";
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
};

const markdownTableFromRows = (rows: Array<Record<string, unknown>>) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (columns.length === 0) return null;
  const escape = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${columns.map(escape).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(" | ")} |`),
  ].join("\n");
};

const parseJsonTable = (text: string) => {
  const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed) && parsed.every(isRecord)) {
      return markdownTableFromRows(parsed as Array<Record<string, unknown>>);
    }
    if (isRecord(parsed)) {
      const rowArray = Object.values(parsed).find(
        (value): value is Array<Record<string, unknown>> =>
          Array.isArray(value) && value.every(isRecord),
      );
      if (rowArray) return markdownTableFromRows(rowArray);
      return markdownTableFromRows([parsed]);
    }
  } catch {
    return null;
  }
  return null;
};

const parseDelimitedTable = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  if (lines[0]?.startsWith("|") && lines.some((line) => /^\|?\s*:?-{3,}/.test(line))) {
    return lines.join("\n");
  }
  const delimiter = lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(",") ? "," : null;
  if (!delimiter) return null;
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  const width = rows[0]?.length ?? 0;
  if (width < 2 || rows.some((row) => row.length !== width)) return null;
  const [header, ...body] = rows;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
};

const normalizeStructuredText = (semanticType: SessionArtifactSemanticType, text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (semanticType === "table") {
    return parseJsonTable(trimmed) ?? parseDelimitedTable(trimmed) ?? trimmed;
  }
  return trimmed;
};

export const parseArtifactOutput = (
  semanticType: SessionArtifactSemanticType | null | undefined,
  text: string,
) => (semanticType ? normalizeStructuredText(semanticType, text) : text.trim());

export const getOutputFormatInstruction = (
  semanticTypes: Array<SessionArtifactSemanticType | null | undefined>,
) => {
  const unique = Array.from(new Set(semanticTypes.filter(isArtifactSemanticType)));
  if (unique.length === 0) return "";
  const instructions = unique.map((type) => {
    switch (type) {
      case "decision":
        return "Decision: state the decision first, then rationale, risks, and alternatives.";
      case "evidence":
        return "Evidence: separate claims, observations, sources, and why each item matters.";
      case "plan":
        return "Plan: provide a goal, ordered steps, dependencies, and status or verification criteria.";
      case "table":
        return "Table: return a valid Markdown table with a header row and consistent columns.";
      default:
        return `${semanticArtifactLabels[type]}: keep the answer clearly structured.`;
    }
  });
  return `\n\nOutput formatting (use the same model response; do not add a second analysis pass):\n${instructions
    .map((instruction) => `- ${instruction}`)
    .join("\n")}\nPreserve all important original content.`;
};


export type ApplyArtifactResponseResult = {
  artifacts: SessionArtifact[];
  links: SessionCanvasLink[];
  capturedArtifactIds: string[];
  skippedArtifactIds: string[];
  changed: boolean;
};

export const applyResponseToArtifacts = ({
  artifacts,
  links,
  promptId,
  responseId,
  sourcePromptId,
  text,
  artifactIds,
  createdAt,
}: {
  artifacts: SessionArtifact[];
  links: SessionCanvasLink[];
  promptId: string;
  responseId: string;
  sourcePromptId?: string;
  text: string;
  artifactIds?: string[];
  createdAt?: string;
}): ApplyArtifactResponseResult => {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      artifacts,
      links,
      capturedArtifactIds: [],
      skippedArtifactIds: [],
      changed: false,
    };
  }

  const linkedArtifactIds = new Set(
    artifactIds && artifactIds.length > 0
      ? artifactIds
      : links
          .filter(
            (link) =>
              link.relation === "output" &&
              (link.promptId === promptId ||
                link.promptId === sourcePromptId ||
                link.responseId === responseId),
          )
          .map((link) => link.artifactId),
  );

  const nextLinks = normalizeSessionCanvasLinks(
    links.map((link) => {
      if (link.relation === "context" && link.promptId === sourcePromptId) {
        return { ...link, promptId, targetMessageId: promptId };
      }
      if (
        link.relation === "output" &&
        (link.promptId === promptId || link.promptId === sourcePromptId) &&
        linkedArtifactIds.has(link.artifactId)
      ) {
        return { ...link, promptId, responseId, targetMessageId: null };
      }
      return link;
    }),
  );

  const capturedArtifactIds: string[] = [];
  const skippedArtifactIds: string[] = [];
  const nextArtifacts = artifacts.map((artifact) => {
    if (!linkedArtifactIds.has(artifact.id)) return artifact;
    if ((artifact.syncMode ?? "auto") === "paused") {
      skippedArtifactIds.push(artifact.id);
      return artifact;
    }
    const parsed = parseArtifactOutput(artifact.semanticType, trimmed);
    if (!parsed) {
      skippedArtifactIds.push(artifact.id);
      return artifact;
    }
    capturedArtifactIds.push(artifact.id);
    return appendArtifactRevision(artifact, {
      content: parsed,
      origin: "automatic",
      author: "model",
      promptId,
      responseId,
      ...(createdAt ? { createdAt } : {}),
    });
  });

  const artifactsChanged = nextArtifacts.some((artifact, index) => artifact !== artifacts[index]);
  const linksChanged = JSON.stringify(nextLinks) !== JSON.stringify(links);
  return {
    artifacts: nextArtifacts,
    links: nextLinks,
    capturedArtifactIds,
    skippedArtifactIds,
    changed: artifactsChanged || linksChanged,
  };
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
  artifact: Pick<SessionArtifact, "artifactType" | "semanticType"> | LlmContextArtifact,
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
