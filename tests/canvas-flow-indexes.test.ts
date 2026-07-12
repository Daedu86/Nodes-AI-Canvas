import { describe, expect, it } from "vitest";
import { buildCanvasFlowIndexes } from "../components/assistant-ui/thread-graph-flow/canvas-flow-indexes";
import type {
  SessionArtifact,
  SessionCanvasLink,
} from "../lib/session-artifacts";

const timestamp = "2026-07-12T14:00:00.000Z";

const artifact: SessionArtifact = {
  id: "artifact-1",
  title: "Artifact",
  artifactType: "text",
  content: "Context",
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("canvas flow indexes", () => {
  it("counts unique existing artifacts and all prompt links in one pass", () => {
    const links: SessionCanvasLink[] = [
      {
        id: "1",
        relation: "context",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "2",
        relation: "context",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "3",
        relation: "context",
        artifactId: "missing-artifact",
        promptId: "prompt-1",
        createdAt: timestamp,
      },
      {
        id: "4",
        relation: "output",
        artifactId: artifact.id,
        promptId: "prompt-1",
        createdAt: timestamp,
      },
    ];

    const indexes = buildCanvasFlowIndexes(
      links,
      new Map([[artifact.id, artifact]]),
    );

    expect(indexes.linkedArtifactCountByTarget.get("prompt-1")).toBe(1);
    expect(indexes.promptLinkCountById.get("prompt-1")).toEqual({
      context: 3,
      output: 1,
    });
  });
});
