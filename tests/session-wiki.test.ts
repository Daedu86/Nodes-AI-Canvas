import { describe, expect, it } from "vitest";
import { buildSessionWiki } from "../lib/session-wiki";

describe("buildSessionWiki", () => {
  it("elevates decision and question artifacts into the session wiki", () => {
    const wiki = buildSessionWiki({
      artifacts: [
        {
          artifactType: "text",
          content: "Ship citations before broader rollout.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "artifact-decision",
          semanticType: "decision",
          title: "Rollout decision",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "How should merge work between sibling branches?",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "artifact-question",
          semanticType: "question",
          title: "Merge question",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      contextLinks: [
        {
          artifactId: "artifact-decision",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "link-1",
          targetMessageId: "assistant-1",
        },
      ],
      nodes: [
        { id: "__ROOT__", parentId: null, role: "ROOT", text: "Conversation Root" },
        { id: "user-1", parentId: "__ROOT__", role: "user", text: "What should ship first?" },
        {
          id: "assistant-1",
          parentId: "user-1",
          role: "assistant",
          text: "Citations first, then broader rollout.",
        },
      ],
      selectedNodeId: "artifact-decision",
      sessionTitle: "Nodes",
    });

    expect(wiki.pages.map((page) => page.id)).toEqual([
      "overview",
      "branches",
      "artifacts",
      "decisions",
      "focus",
      "open-questions",
    ]);

    const decisionsPage = wiki.pages.find((page) => page.id === "decisions");
    expect(decisionsPage?.body).toContain("Rollout decision");
    expect(decisionsPage?.body).toContain("Linked targets: 1");

    const openQuestionsPage = wiki.pages.find((page) => page.id === "open-questions");
    expect(openQuestionsPage?.body).toContain("Artifact · Merge question");
    expect(openQuestionsPage?.body).toContain("What should ship first?");

    const focusPage = wiki.pages.find((page) => page.id === "focus");
    expect(focusPage?.summary).toContain("decision artifact");
  });
});
