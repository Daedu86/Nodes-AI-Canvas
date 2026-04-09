import type { ParsedNodyInsight, NodySourceCatalogEntry } from "@/lib/nody-insight";
import {
  getSemanticArtifactLabel,
  getSessionArtifactPreview,
  type SessionArtifact,
} from "@/lib/session-artifacts";
import type { SessionWiki } from "@/lib/session-wiki";

export type SessionBrief = {
  title: string;
  summary: string;
  recommendation: string;
  next: string | null;
  evidence: NodySourceCatalogEntry[];
  openQuestions: string[];
  signals: string[];
};

type BuildSessionBriefArgs = {
  artifacts: SessionArtifact[];
  insight: ParsedNodyInsight | null;
  sessionTitle: string | null;
  sources: NodySourceCatalogEntry[];
  wiki: SessionWiki | null;
};

const parseOpenQuestions = (wiki: SessionWiki | null) => {
  const page = wiki?.pages.find((entry) => entry.id === "open-questions");
  if (!page) return [];
  return page.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter((line) => line.length > 0);
};

const getSemanticArtifacts = (
  artifacts: SessionArtifact[],
  semanticType: NonNullable<SessionArtifact["semanticType"]>,
) =>
  artifacts.filter(
    (artifact) => artifact.artifactType === "text" && artifact.semanticType === semanticType,
  );

const buildArtifactSourceEntry = (
  artifact: SessionArtifact,
): NodySourceCatalogEntry => ({
  kind: "artifact",
  label: `${getSemanticArtifactLabel(artifact.semanticType) ?? "Artifact"} · ${artifact.title}`,
  preview: getSessionArtifactPreview(artifact, 160),
  ref: `artifact:${artifact.id}`,
  targetId: artifact.id,
});

const buildSignalSummary = (artifacts: SessionArtifact[], wiki: SessionWiki | null) => {
  const semanticCounts = new Map<string, number>();
  artifacts.forEach((artifact) => {
    if (artifact.artifactType !== "text" || !artifact.semanticType) return;
    semanticCounts.set(artifact.semanticType, (semanticCounts.get(artifact.semanticType) ?? 0) + 1);
  });

  const semanticSignals = [...semanticCounts.entries()].map(([semanticType, count]) => {
    const label = semanticType.charAt(0).toUpperCase() + semanticType.slice(1);
    return `${count} ${label.toLowerCase()} artifact${count === 1 ? "" : "s"}`;
  });

  const fallbackSignals: string[] = [];
  if (wiki) {
    fallbackSignals.push(`${wiki.pages.length} wiki page${wiki.pages.length === 1 ? "" : "s"}`);
  }
  if (artifacts.length > 0) {
    fallbackSignals.push(`${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} in canvas`);
  }

  return semanticSignals.length > 0 ? semanticSignals : fallbackSignals;
};

export const buildSessionBrief = ({
  artifacts,
  insight,
  sessionTitle,
  sources,
  wiki,
}: BuildSessionBriefArgs): SessionBrief => {
  const overview = wiki?.pages.find((page) => page.id === "overview");
  const focus = wiki?.pages.find((page) => page.id === "focus");
  const decisionArtifacts = getSemanticArtifacts(artifacts, "decision");
  const evidenceArtifacts = getSemanticArtifacts(artifacts, "evidence");
  const questionArtifacts = getSemanticArtifacts(artifacts, "question");
  const summary =
    overview?.summary ??
    `${sessionTitle?.trim() || "Untitled session"} is ready for a canonical brief.`;

  const recommendation =
    insight?.answer?.trim() ||
    decisionArtifacts[0]?.content?.trim() ||
    focus?.summary ||
    "Ask Nody a concrete question to generate a current recommendation.";
  const next =
    insight?.next && insight.next.trim().length > 0 && !/^none$/i.test(insight.next.trim())
      ? insight.next.trim()
      : null;
  const evidence =
    sources.length > 0
      ? sources.slice(0, 4)
      : evidenceArtifacts.slice(0, 4).map(buildArtifactSourceEntry);
  const openQuestions = [
    ...questionArtifacts.map(
      (artifact) => `${artifact.title}: ${getSessionArtifactPreview(artifact, 180)}`,
    ),
    ...parseOpenQuestions(wiki),
  ].filter((entry, index, array) => array.indexOf(entry) === index);

  return {
    title: sessionTitle?.trim() || "Untitled session",
    summary,
    recommendation,
    next,
    evidence,
    openQuestions: openQuestions.slice(0, 4),
    signals: buildSignalSummary(artifacts, wiki),
  };
};
