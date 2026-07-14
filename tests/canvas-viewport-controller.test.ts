import { describe, expect, it } from "vitest";
import { shouldRefitCanvasTree } from "@/components/assistant-ui/thread-graph-flow/use-canvas-viewport-controller";

describe("shouldRefitCanvasTree", () => {
  it("does not refit during the initial graph hydration", () => {
    expect(shouldRefitCanvasTree(null, "tree-a")).toBe(false);
  });

  it("does not refit when the graph structure is unchanged", () => {
    expect(shouldRefitCanvasTree("tree-a", "tree-a")).toBe(false);
  });

  it("refits when an existing graph changes structure", () => {
    expect(shouldRefitCanvasTree("tree-a", "tree-b")).toBe(true);
  });
});
