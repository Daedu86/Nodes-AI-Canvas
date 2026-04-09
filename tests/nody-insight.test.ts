import { describe, expect, it } from "vitest";
import { parseNodyInsight, resolveNodySources } from "../lib/nody-insight";

describe("nody insight parsing", () => {
  it("parses answer, next, and source refs", () => {
    const parsed = parseNodyInsight(
      [
        "Answer:",
        "The current branch is already converging on the wiki-first direction.",
        "",
        "Next:",
        "Promote the decision into the brief and prune the weaker branch.",
        "",
        "Sources:",
        "page:overview, node:msg-1, artifact:artifact-1",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      answer: "The current branch is already converging on the wiki-first direction.",
      next: "Promote the decision into the brief and prune the weaker branch.",
      sourceRefs: ["page:overview", "node:msg-1", "artifact:artifact-1"],
    });
  });

  it("resolves source refs against a catalog", () => {
    const resolved = resolveNodySources(
      [
        { kind: "wiki", label: "Wiki · Overview", preview: "overview summary", ref: "page:overview", targetId: "overview" },
        { kind: "node", label: "assistant · branch", preview: "branch preview", ref: "node:msg-1", targetId: "msg-1" },
      ],
      ["page:overview", "node:msg-1", "artifact:missing"],
    );

    expect(resolved.map((entry) => entry.ref)).toEqual(["page:overview", "node:msg-1"]);
  });
});
