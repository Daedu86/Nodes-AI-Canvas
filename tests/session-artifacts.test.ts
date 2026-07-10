import { describe, expect, it } from "vitest";
import {
  MAX_ARTIFACT_REVISIONS,
  appendArtifactRevision,
  applyResponseToArtifacts,
  normalizeSessionArtifacts,
  normalizeSessionCanvasLinks,
  parseArtifactOutput,
  restoreArtifactRevision,
  validateSessionCanvasConnection,
  type SessionArtifact,
} from "@/lib/session-artifacts";

const makeArtifact = (overrides: Partial<SessionArtifact> = {}): SessionArtifact => ({
  id: "artifact-1",
  title: "Plan",
  artifactType: "text",
  semanticType: "plan",
  content: "Initial",
  syncMode: "auto",
  revisions: [],
  createdAt: "2026-07-10T10:00:00.000Z",
  updatedAt: "2026-07-10T10:00:00.000Z",
  ...overrides,
});

const pendingLinks = normalizeSessionCanvasLinks([
  {
    id: "context-draft",
    relation: "context",
    artifactId: "input-1",
    promptId: "__CANVAS_PROMPT_DRAFT__",
    createdAt: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "output-draft",
    relation: "output",
    artifactId: "artifact-1",
    promptId: "__CANVAS_PROMPT_DRAFT__",
    createdAt: "2026-07-10T10:00:00.000Z",
  },
]);

describe("session artifact compatibility", () => {
  it("normalizes legacy links and preserves question/draft/table", () => {
    const [legacy] = normalizeSessionCanvasLinks([
      { id: "legacy", artifactId: "artifact-1", targetMessageId: "prompt-1", createdAt: "2026-07-10T10:00:00.000Z" },
    ]);
    expect(legacy).toMatchObject({ relation: "context", promptId: "prompt-1", targetMessageId: "prompt-1" });

    const artifacts = normalizeSessionArtifacts([
      { ...makeArtifact({ id: "q", semanticType: "question" }), syncMode: undefined, revisions: undefined },
      makeArtifact({ id: "d", semanticType: "draft" }),
      makeArtifact({ id: "t", semanticType: "table" }),
    ]);
    expect(artifacts.map((item) => item.semanticType)).toEqual(["question", "draft", "table"]);
    expect(artifacts[0]).toMatchObject({ syncMode: "auto", revisions: [] });
  });
});

describe("canvas connection validation", () => {
  it("accepts compatible directions and rejects invalid links", () => {
    const context = validateSessionCanvasConnection({
      source: { id: "artifact-1", kind: "artifact" },
      target: { id: "prompt-1", kind: "prompt" },
      links: [],
    });
    const output = validateSessionCanvasConnection({
      source: { id: "response-1", kind: "response" },
      target: { id: "artifact-1", kind: "artifact" },
      links: [],
    });
    expect(context).toMatchObject({ ok: true, link: { relation: "context" } });
    expect(output).toMatchObject({ ok: true, link: { relation: "output", responseId: "response-1" } });

    const existing = normalizeSessionCanvasLinks([
      { id: "context", relation: "context", artifactId: "artifact-1", promptId: "prompt-1", createdAt: "2026-07-10T10:00:00.000Z" },
    ]);
    expect(validateSessionCanvasConnection({ source: { id: "artifact-1", kind: "artifact" }, target: { id: "prompt-1", kind: "prompt" }, links: existing })).toMatchObject({ ok: false, reason: "duplicate" });
    expect(validateSessionCanvasConnection({ source: { id: "artifact-1", kind: "artifact" }, target: { id: "response-1", kind: "response" }, links: [] })).toMatchObject({ ok: false, reason: "inverse" });
    expect(validateSessionCanvasConnection({ source: { id: "same", kind: "artifact" }, target: { id: "same", kind: "artifact" }, links: [] })).toMatchObject({ ok: false, reason: "self" });
    expect(validateSessionCanvasConnection({ source: { id: "a", kind: "artifact" }, target: { id: "b", kind: "artifact" }, links: [] })).toMatchObject({ ok: false, reason: "incompatible" });
  });
});

describe("deterministic parsing and revisions", () => {
  it("parses table JSON and falls back to the complete response", () => {
    expect(parseArtifactOutput("table", '[{"Name":"Alpha","Status":"Done"}]')).toBe(
      "| Name | Status |\n| --- | --- |\n| Alpha | Done |",
    );
    const narrative = "Narrative answer with no tabular structure.";
    expect(parseArtifactOutput("table", narrative)).toBe(narrative);
    expect(parseArtifactOutput("plan", narrative)).toBe(narrative);
  });

  it("caps history and restores by appending a user revision", () => {
    let current = makeArtifact();
    for (let index = 0; index < MAX_ARTIFACT_REVISIONS + 3; index += 1) {
      current = appendArtifactRevision(current, {
        id: `revision-${index}`,
        content: `Version ${index}`,
        origin: "automatic",
        author: "model",
        createdAt: `2026-07-10T10:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }
    expect(current.revisions).toHaveLength(MAX_ARTIFACT_REVISIONS);
    const target = current.revisions?.[0];
    const restored = restoreArtifactRevision(current, target!.id, "2026-07-10T11:00:00.000Z");
    expect(restored.content).toBe(target!.content);
    expect(restored.revisions?.at(-1)).toMatchObject({ origin: "restore", author: "user", content: target!.content });
  });
});

describe("run-end synchronization", () => {
  it("does not mutate on empty output and respects paused sync", () => {
    const initial = [makeArtifact()];
    expect(applyResponseToArtifacts({ artifacts: initial, links: pendingLinks, promptId: "prompt-1", responseId: "response-1", sourcePromptId: "__CANVAS_PROMPT_DRAFT__", text: " " })).toMatchObject({ changed: false, artifacts: initial, links: pendingLinks });

    const paused = applyResponseToArtifacts({
      artifacts: [makeArtifact({ syncMode: "paused", content: "Manual edit" })],
      links: pendingLinks.filter((link) => link.relation === "output"),
      promptId: "prompt-1",
      responseId: "response-1",
      sourcePromptId: "__CANVAS_PROMPT_DRAFT__",
      text: "Model response",
    });
    expect(paused.artifacts[0]).toMatchObject({ content: "Manual edit", revisions: [] });
    expect(paused.skippedArtifactIds).toEqual(["artifact-1"]);
    expect(paused.links[0]).toMatchObject({ promptId: "prompt-1", responseId: "response-1" });
  });

  it("captures only at completion, resolves pending links, and creates one revision per run", () => {
    const first = applyResponseToArtifacts({
      artifacts: [makeArtifact(), makeArtifact({ id: "input-1", semanticType: null })],
      links: pendingLinks,
      promptId: "prompt-1",
      responseId: "response-1",
      sourcePromptId: "__CANVAS_PROMPT_DRAFT__",
      text: "Version one",
      createdAt: "2026-07-10T10:05:00.000Z",
    });
    expect(first.capturedArtifactIds).toEqual(["artifact-1"]);
    expect(first.artifacts[0]).toMatchObject({ content: "Version one", revisions: [{ author: "model", promptId: "prompt-1", responseId: "response-1" }] });
    expect(first.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "context", promptId: "prompt-1", targetMessageId: "prompt-1" }),
      expect.objectContaining({ relation: "output", promptId: "prompt-1", responseId: "response-1" }),
    ]));

    const second = applyResponseToArtifacts({
      artifacts: first.artifacts,
      links: first.links,
      promptId: "prompt-2",
      responseId: "response-2",
      artifactIds: ["artifact-1"],
      text: "Version two",
    });
    expect(second.artifacts[0]).toMatchObject({ content: "Version two" });
    expect(second.artifacts[0].revisions).toHaveLength(2);
  });
});
