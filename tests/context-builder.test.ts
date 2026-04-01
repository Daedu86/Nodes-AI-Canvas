import { describe, expect, it } from "vitest";
import {
  buildContextArtifactsBlock,
  buildContextArtifactsUserMessage,
} from "../lib/llm/context-builder";

describe("context builder", () => {
  it("formats text, code, image, and file artifacts into a reusable context block", () => {
    const result = buildContextArtifactsBlock([
      {
        id: "artifact-1",
        artifactType: "text",
        title: "Product goal",
        content: "We want a branching canvas.",
        language: null,
      },
      {
        id: "artifact-2",
        artifactType: "code",
        title: "graph.ts",
        content: "export const answer = 42;",
        language: "ts",
      },
      {
        id: "artifact-3",
        artifactType: "image",
        title: "Flow mock",
        content: "A screenshot of the desired branching layout.",
        fileName: "flow.png",
        mimeType: "image/png",
        byteSize: 24_000,
        language: null,
      },
      {
        id: "artifact-4",
        artifactType: "file",
        title: "requirements",
        content: "The graph should accept multimodal artifact context.",
        fileName: "requirements.md",
        mimeType: "text/markdown",
        byteSize: 1_200,
        language: null,
      },
    ]);
    const block = result.block;

    expect(block).toContain("Attached context artifacts:");
    expect(block).toContain("[text] Product goal");
    expect(block).toContain("[code] graph.ts (ts)");
    expect(block).toContain("[image] Flow mock file=flow.png mime=image/png");
    expect(block).toContain("[file] requirements file=requirements.md mime=text/markdown");
    expect(result.includedArtifacts).toHaveLength(4);
    expect(result.excludedArtifacts).toHaveLength(0);
  });

  it("builds a user-scoped context message for attached artifacts", () => {
    const artifactMessage = buildContextArtifactsUserMessage([
      {
        id: "artifact-1",
        artifactType: "text",
        title: "Constraint",
        content: "Only use free models.",
        language: null,
      },
    ]);

    expect(artifactMessage).toEqual({
      role: "user",
      content: expect.stringContaining("Only use free models."),
    });
  });

  it("enforces artifact count and truncates oversized artifact text", () => {
    const result = buildContextArtifactsBlock(
      [
        {
          id: "artifact-long",
          artifactType: "text",
          title: "Very long note",
          content: "A".repeat(12_000),
          language: null,
        },
        {
          id: "artifact-2",
          artifactType: "text",
          title: "Two",
          content: "Second artifact",
          language: null,
        },
        {
          id: "artifact-3",
          artifactType: "text",
          title: "Three",
          content: "Third artifact",
          language: null,
        },
        {
          id: "artifact-4",
          artifactType: "text",
          title: "Four",
          content: "Fourth artifact",
          language: null,
        },
        {
          id: "artifact-5",
          artifactType: "text",
          title: "Five",
          content: "Fifth artifact",
          language: null,
        },
      ],
      { modelId: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter" },
    );

    expect(result.includedArtifacts).toHaveLength(4);
    expect(result.excludedArtifacts).toHaveLength(1);
    expect(result.excludedArtifacts[0]).toMatchObject({
      id: "artifact-5",
      reason: "artifact-limit",
    });
    expect(result.includedArtifacts[0]?.truncated).toBe(true);
    expect(result.block).toContain("[text] Very long note");
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.policy.maxArtifactTokensPerPrompt);
  });
});
