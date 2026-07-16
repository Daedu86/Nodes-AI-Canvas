import { describe, expect, it } from "vitest";
import {
  buildCanvasContextMessages,
  isCompletedRuntimeResponse,
} from "../components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";
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
    expect(buildCanvasContextMessages(nodes, "a1", "branch", "Draft").map((m) => m.content)).toEqual(["One", "Two", "Draft"]);
    expect(buildCanvasContextMessages(nodes, "a1", "tree", "Draft").map((m) => m.content)).toEqual(["One", "Two", "Three", "Parallel", "Draft"]);
  });

  it("keeps Parent context valid when the saved parent is an assistant", () => {
    expect(buildCanvasContextMessages(nodes, "a1", "parent", "Draft")).toEqual([
      {
        role: "user",
        content:
          "Continue from the saved assistant response below; treat it as conversation context.",
      },
      { id: "a1", role: "assistant", content: "Two" },
      { role: "user", content: "Draft" },
    ]);
  });

  it("does not add the Parent marker to a valid branch or an empty root context", () => {
    expect(
      buildCanvasContextMessages(nodes, "a1", "branch", "Draft").map(
        (message) => message.role,
      ),
    ).toEqual(["user", "assistant", "user"]);
    expect(buildCanvasContextMessages(nodes, null, "parent", "Draft")).toEqual([
      { role: "user", content: "Draft" },
    ]);
  });

  it("commits only a runtime response with complete status", () => {
    const snapshot = {
      messages: [
        { message: { id: "complete", status: { type: "complete" } } },
        { message: { id: "failed", status: { type: "incomplete" } } },
      ],
    };
    expect(isCompletedRuntimeResponse(snapshot, "complete")).toBe(true);
    expect(isCompletedRuntimeResponse(snapshot, "failed")).toBe(false);
    expect(isCompletedRuntimeResponse(snapshot, "missing")).toBe(false);
  });
});
