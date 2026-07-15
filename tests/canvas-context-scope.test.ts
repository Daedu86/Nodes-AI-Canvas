import { describe, expect, it } from "vitest";
import { buildCanvasContextMessages } from "../components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";
import type { Node } from "../components/assistant-ui/thread-graph/graph-types";

const nodes: Node[] = [
  { id: "__ROOT__", parentId: null, role: "ROOT", text: "Root", depth: 0, idx: -1 },
  { id: "u1", parentId: "__ROOT__", role: "user", text: "One", depth: 1, idx: 0 },
  { id: "a1", parentId: "u1", role: "assistant", text: "Two", depth: 2, idx: 1 },
  { id: "u2", parentId: "a1", role: "user", text: "Three", depth: 3, idx: 2 },
  { id: "side", parentId: "__ROOT__", role: "user", text: "Parallel", depth: 1, idx: 3 },
  { id: "bridge", parentId: "u1", role: "bridge", text: "Hidden", depth: 2, idx: 4 },
];

describe("canvas context scopes", () => {
  it("builds parent, branch and full-tree histories deterministically", () => {
    expect(buildCanvasContextMessages(nodes, "a1", "parent", "Draft").map((m) => m.content)).toEqual(["Two", "Draft"]);
    expect(buildCanvasContextMessages(nodes, "a1", "branch", "Draft").map((m) => m.content)).toEqual(["One", "Two", "Draft"]);
    expect(buildCanvasContextMessages(nodes, "a1", "tree", "Draft").map((m) => m.content)).toEqual(["One", "Two", "Three", "Parallel", "Draft"]);
  });
});
