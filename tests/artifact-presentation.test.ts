import { describe, expect, it } from "vitest";
import {
  getArtifactCodeSample,
  getArtifactHeadline,
  getArtifactHighlights,
  getArtifactIntentLabel,
  getArtifactLineCount,
  getArtifactReadableRole,
} from "../components/assistant-ui/thread-graph-flow/artifact-presentation";

describe("artifact presentation helpers", () => {
  it("extracts a readable headline and highlights from narrative content", () => {
    const artifact = {
      artifactType: "text" as const,
      byteSize: null,
      content: "# Decision\n- Ship wiki first\n- Keep Nody focused on export",
      fileName: null,
      language: null,
      mimeType: null,
      title: "Decision Brief",
    };

    expect(getArtifactHeadline(artifact)).toBe("Decision");
    expect(getArtifactHighlights(artifact)).toEqual([
      "Ship wiki first",
      "Keep Nody focused on export",
    ]);
  });

  it("returns code samples and line counts for code artifacts", () => {
    const artifact = {
      artifactType: "code" as const,
      byteSize: null,
      content: "const answer = 42;\n\nconsole.log(answer);\nreturn answer;",
      fileName: "example.ts",
      language: "ts",
      mimeType: "text/typescript",
      title: "Example",
    };

    expect(getArtifactCodeSample(artifact, 2)).toEqual([
      "const answer = 42;",
      "console.log(answer);",
    ]);
    expect(getArtifactLineCount(artifact)).toBe(4);
  });

  it("maps artifact types to human-readable roles and intents", () => {
    expect(getArtifactReadableRole("image")).toBe("Visual evidence");
    expect(getArtifactIntentLabel("file")).toContain("source file");
  });
});
