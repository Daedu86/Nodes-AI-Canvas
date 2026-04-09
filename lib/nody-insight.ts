import type { SessionWikiPageId } from "@/lib/session-wiki";

export type NodySourceKind = "wiki" | "node" | "artifact";

export type NodySourceCatalogEntry = {
  ref: string;
  kind: NodySourceKind;
  targetId: SessionWikiPageId | string;
  label: string;
  preview: string | null;
};

export type ParsedNodyInsight = {
  answer: string;
  next: string | null;
  sourceRefs: string[];
};

const SECTION_STOP_PATTERN = "Answer|Observation|Interpretation|Next move|Next|Sources";

const extractSection = (text: string, label: string, fallback = "") => {
  const pattern = new RegExp(
    `${label}:\\s*([\\s\\S]*?)(?=\\n(?:${SECTION_STOP_PATTERN}):|$)`,
    "i",
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() || fallback;
};

const fallbackInsight = (insight: string): ParsedNodyInsight => ({
  answer: insight.trim(),
  next: null,
  sourceRefs: [],
});

const parseSourceRefs = (raw: string) => {
  if (!raw || /^none$/i.test(raw.trim())) return [];
  const refs = raw
    .split(/\r?\n|,/)
    .map((part) =>
      part
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/[`"'()[\]]/g, "")
        .trim(),
    )
    .flatMap((part) => part.match(/(?:page|node|artifact):[A-Za-z0-9_-]+/g) ?? [])
    .filter((value, index, array) => array.indexOf(value) === index);
  return refs;
};

export const parseNodyInsight = (insight: string | null): ParsedNodyInsight | null => {
  if (!insight || insight.trim().length === 0) return null;
  if (/(Answer|Next|Sources):/i.test(insight)) {
    return {
      answer: extractSection(insight, "Answer", "No answer provided."),
      next: extractSection(insight, "Next", ""),
      sourceRefs: parseSourceRefs(extractSection(insight, "Sources", "")),
    };
  }
  if (/(Observation|Interpretation|Next move):/i.test(insight)) {
    const observation = extractSection(insight, "Observation", "");
    const interpretation = extractSection(insight, "Interpretation", "");
    return {
      answer:
        [observation, interpretation].filter((value) => value.length > 0).join("\n\n") ||
        "No answer provided.",
      next: extractSection(insight, "Next move", ""),
      sourceRefs: [],
    };
  }
  return fallbackInsight(insight);
};

export const resolveNodySources = (
  catalog: NodySourceCatalogEntry[],
  refs: string[],
) =>
  refs
    .map((ref) => catalog.find((entry) => entry.ref === ref) ?? null)
    .filter((entry): entry is NodySourceCatalogEntry => Boolean(entry));
