import { describe, expect, it } from "vitest";
import { buildSessionBrief } from "../lib/session-brief";

describe("session brief builder", () => {
  it("combines wiki, insight, and sources into a brief", () => {
    const brief = buildSessionBrief({
      artifacts: [
        {
          artifactType: "text",
          content: "Ship the wiki first.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "artifact-1",
          semanticType: "decision",
          title: "Decision 1",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      insight: {
        answer: "Ship the wiki first, then let Nody cite it.",
        next: "Promote the decision into the brief.",
        sourceRefs: ["page:overview"],
      },
      sessionTitle: "Nodes",
      sources: [
        {
          kind: "wiki",
          label: "Wiki · Overview",
          preview: "overview summary",
          ref: "page:overview",
          targetId: "overview",
        },
      ],
      wiki: {
        digest: "digest",
        pages: [
          {
            body: "Session body",
            id: "overview",
            summary: "Nodes has 8 nodes and 2 branches.",
            title: "Overview",
          },
          {
            body: "- Q1: Should the brief be the final export?\n- Q2: How strict should citations be?",
            id: "open-questions",
            summary: "Two open questions remain.",
            title: "Open Questions",
          },
        ],
      },
    });

    expect(brief.summary).toBe("Nodes has 8 nodes and 2 branches.");
    expect(brief.recommendation).toContain("Ship the wiki first");
    expect(brief.next).toBe("Promote the decision into the brief.");
    expect(brief.evidence).toHaveLength(1);
    expect(brief.openQuestions).toEqual([
      "Q1: Should the brief be the final export?",
      "Q2: How strict should citations be?",
    ]);
    expect(brief.signals[0]).toContain("decision artifact");
  });

  it("falls back to semantic artifacts when Nody sources are missing", () => {
    const brief = buildSessionBrief({
      artifacts: [
        {
          artifactType: "text",
          content: "Adopt semantic artifacts before adding more providers.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "decision-1",
          semanticType: "decision",
          title: "Priority decision",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "The current canvas already supports typed semantic notes.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "evidence-1",
          semanticType: "evidence",
          title: "Canvas evidence",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "How should merge work across worlds?",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "question-1",
          semanticType: "question",
          title: "Merge worlds",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      insight: null,
      sessionTitle: "Nodes",
      sources: [],
      wiki: null,
    });

    expect(brief.recommendation).toContain("Adopt semantic artifacts");
    expect(brief.evidence).toEqual([
      expect.objectContaining({
        kind: "artifact",
        ref: "artifact:evidence-1",
      }),
    ]);
    expect(brief.openQuestions[0]).toContain("Merge worlds");
  });
});
