import { describe, expect, it } from "vitest";
import {
  compactFullTreeRequestBody,
  packFullTreeContextMessages,
} from "../lib/full-tree-context";

describe("full tree context transport", () => {
  it("packs a large tree into one bounded system reference plus the current prompt", () => {
    const messages = [
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `node-${index}`,
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: `${index}: ${"x".repeat(2_048)}`,
      })),
      { id: "prompt", role: "user" as const, content: "What happened across the tree?" },
    ];

    const packed = packFullTreeContextMessages(messages);

    expect(packed).toHaveLength(2);
    expect(packed[0]?.role).toBe("system");
    expect(packed[0]?.content).toContain("full conversation tree");
    expect(packed[0]?.content.length).toBeLessThanOrEqual(48 * 1024);
    expect(packed[1]).toEqual(messages.at(-1));
    expect(packFullTreeContextMessages(packed)).toEqual(packed);
  });

  it("compacts tree runConfig at the final transport boundary without touching branch context", () => {
    const treeMessages = [
      { id: "u-1", role: "user" as const, content: "First" },
      { id: "a-1", role: "assistant" as const, content: "Second" },
      { id: "u-2", role: "user" as const, content: "Current" },
    ];
    const treeBody = compactFullTreeRequestBody({
      runConfig: {
        custom: {
          contextScope: "tree",
          contextMessages: treeMessages,
        },
      },
    });
    const branchBody = compactFullTreeRequestBody({
      runConfig: {
        custom: {
          contextScope: "branch",
          contextMessages: treeMessages,
        },
      },
    });

    const treeRunConfig = treeBody.runConfig as {
      custom: { contextMessages: unknown[] };
    };
    const branchRunConfig = branchBody.runConfig as {
      custom: { contextMessages: unknown[] };
    };

    expect(treeRunConfig.custom.contextMessages).toHaveLength(2);
    expect(branchRunConfig.custom.contextMessages).toEqual(treeMessages);
  });
});
