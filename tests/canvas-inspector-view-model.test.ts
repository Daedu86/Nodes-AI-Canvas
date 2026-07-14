import { describe, expect, it } from "vitest";
import { buildCanvasBranchTrail } from "@/components/assistant-ui/thread-graph-flow/use-canvas-inspector-view-model";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";

const node = (
  id: string,
  parentId: string | null,
  text: string,
  role: ThreadGraphNodeModel["role"],
): ThreadGraphNodeModel => ({
  id,
  parentId,
  text,
  role,
  depth: parentId ? 1 : 0,
  idx: 0,
  branchId: null,
  isBridge: false,
  model: null,
  provider: null,
});

describe("buildCanvasBranchTrail", () => {
  it("builds a root-to-selection label trail", () => {
    const root = node("root", null, "root", "ROOT");
    const prompt = node("prompt", "root", "Explain the architecture", "user");
    const response = node("response", "prompt", "Detailed response", "assistant");
    const index = new Map([
      [root.id, root],
      [prompt.id, prompt],
      [response.id, response],
    ]);

    expect(buildCanvasBranchTrail(response, index)).toEqual([
      "root",
      "Explain the architecture",
      "Detailed response",
    ]);
  });

  it("stops safely when a cycle is present", () => {
    const first = node("first", "second", "First", "user");
    const second = node("second", "first", "Second", "assistant");
    const index = new Map([
      [first.id, first],
      [second.id, second],
    ]);

    expect(buildCanvasBranchTrail(first, index)).toEqual(["Second", "First"]);
  });
});
