import { describe, expect, it } from "vitest";
import { buildCanvasLegendItems } from "@/components/assistant-ui/thread-graph-flow/use-canvas-graph-view-model";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";
import type { SessionArtifact } from "@/lib/session-artifacts";

const root: ThreadGraphNodeModel = {
  id: "root",
  parentId: null,
  role: "ROOT",
  text: "root",
  depth: 0,
  idx: -1,
  branchId: null,
  isBridge: false,
  model: null,
  provider: null,
};

const artifact = (id: string, artifactType: SessionArtifact["artifactType"]): SessionArtifact => ({
  id,
  artifactType,
  semanticType: null,
  title: id,
  content: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  syncMode: "auto",
  revisions: [],
});

describe("buildCanvasLegendItems", () => {
  it("adds entries for present artifact categories and independent prompts", () => {
    const items = buildCanvasLegendItems(
      [root],
      [artifact("text", "text"), artifact("code", "code")],
      [artifact("prompt", "prompt")],
    );

    expect(items.map((item) => item.key)).toEqual(
      expect.arrayContaining(["artifact-text", "artifact-code", "canvas-prompt"]),
    );
  });
});
