
import { describe, expect, it } from "vitest";
import {
  normalizeSessionArtifacts,
  toLlmContextArtifacts,
} from "../lib/session-artifacts";

describe("canvas prompt artifacts", () => {
  it("persists prompt run state without injecting prompt nodes into LLM context", () => {
    const [prompt] = normalizeSessionArtifacts([
      {
        artifactType: "prompt",
        content: "Compare the alternatives",
        createdAt: "2026-07-11T00:00:00.000Z",
        id: "prompt-1",
        promptModel: "openrouter/free",
        promptProvider: "openrouter",
        promptResult: "Alternative A is safer.",
        promptRunId: "run-1",
        promptStatus: "completed",
        title: "Architecture prompt",
        updatedAt: "2026-07-11T00:00:01.000Z",
      },
    ]);

    expect(prompt).toMatchObject({
      artifactType: "prompt",
      promptModel: "openrouter/free",
      promptProvider: "openrouter",
      promptRunId: "run-1",
      promptStatus: "completed",
    });
    expect(toLlmContextArtifacts([prompt!])).toEqual([]);
  });
});
