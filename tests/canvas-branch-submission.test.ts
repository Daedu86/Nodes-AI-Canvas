import { describe, expect, it } from "vitest";
import { findCompletedCanvasRunNodes } from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";
import type { Node as ThreadGraphNodeModel } from "@/components/assistant-ui/thread-graph/graph-types";

const node = (
  id: string,
  role: ThreadGraphNodeModel["role"],
  idx: number,
  parentId: string | null,
): ThreadGraphNodeModel => ({
  id,
  parentId,
  role,
  text: id,
  depth: parentId ? 1 : 0,
  idx,
  branchId: null,
  isBridge: false,
  model: null,
  provider: null,
});

describe("findCompletedCanvasRunNodes", () => {
  it("selects the latest assistant response and its prompt parent", () => {
    const existing = node("existing", "assistant", 1, "root");
    const prompt = node("prompt", "user", 2, "existing");
    const response = node("response", "assistant", 3, "prompt");

    expect(
      findCompletedCanvasRunNodes(
        [existing, prompt, response],
        new Set(["existing"]),
      ),
    ).toEqual({ promptNode: prompt, responseNode: response });
  });

  it("returns null nodes while the completed response is not available", () => {
    const existing = node("existing", "assistant", 1, "root");
    expect(
      findCompletedCanvasRunNodes([existing], new Set(["existing"])),
    ).toEqual({ promptNode: null, responseNode: null });
  });
});
