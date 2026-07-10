import { describe, expect, it } from "vitest";
import { buildSessionBrief } from "../lib/session-brief";

describe("session brief builder", () => {
  it("combines wiki and semantic artifacts into a brief", () => {
    const brief = buildSessionBrief({
      artifacts: [
        {
          artifactType: "text",
          content: "Ship the wiki first.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "decision-1",
          semanticType: "decision",
          title: "Decision 1",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "Publish the migration checklist.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "plan-1",
          semanticType: "plan",
          title: "Rollout plan",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      sessionTitle: "Nodes",
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
    expect(brief.next).toBe("Publish the migration checklist.");
    expect(brief.openQuestions).toEqual([
      "Q1: Should the brief be the final export?",
      "Q2: How strict should citations be?",
    ]);
    expect(brief.signals[0]).toContain("decision artifact");
  });

  it("uses evidence and question artifacts without an AI guide", () => {
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
      sessionTitle: "Nodes",
      wiki: null,
    });

    expect(brief.recommendation).toContain("Adopt semantic artifacts");
    expect(brief.evidence).toEqual([
      expect.objectContaining({ kind: "artifact", ref: "artifact:evidence-1" }),
    ]);
    expect(brief.openQuestions[0]).toContain("Merge worlds");
  });
});
