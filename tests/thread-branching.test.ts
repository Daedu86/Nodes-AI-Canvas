import { describe, expect, it } from "vitest";
import { ROOT_NODE_ID } from "../components/assistant-ui/thread-graph/graph-types";
import {
  buildBranchSpec,
  getAllowedBranchOperations,
} from "../lib/thread-branching";

describe("thread branching core", () => {
  it("allows a new root prompt only from the synthetic root node", () => {
    const operations = getAllowedBranchOperations({
      id: ROOT_NODE_ID,
      parentId: null,
      role: "ROOT",
      isBridge: false,
    });

    expect(operations).toEqual(["new-root-prompt"]);

    expect(
      buildBranchSpec(
        {
          id: ROOT_NODE_ID,
          parentId: null,
          role: "ROOT",
          isBridge: false,
        },
        "new-root-prompt",
      ),
    ).toMatchObject({
      parentId: null,
      sourceId: null,
      targetRole: "user",
      startRun: true,
    });
  });

  it("creates a user sibling branch using the anchor parent", () => {
    expect(
      buildBranchSpec(
        {
          id: "user-1",
          parentId: ROOT_NODE_ID,
          role: "user",
          isBridge: false,
        },
        "create-sibling-prompt",
      ),
    ).toMatchObject({
      parentId: null,
      sourceId: "user-1",
      targetRole: "user",
    });

    expect(
      buildBranchSpec(
        {
          id: "user-2",
          parentId: "assistant-1",
          role: "user",
          isBridge: false,
        },
        "create-sibling-prompt",
      ),
    ).toMatchObject({
      parentId: "assistant-1",
      sourceId: "user-2",
    });
  });

  it("creates a follow-up prompt beneath assistant nodes and blocks bridge nodes", () => {
    expect(
      buildBranchSpec(
        {
          id: "assistant-1",
          parentId: "user-1",
          role: "assistant",
          isBridge: false,
        },
        "create-follow-up-prompt",
      ),
    ).toMatchObject({
      parentId: "assistant-1",
      sourceId: null,
      targetRole: "user",
    });

    expect(
      getAllowedBranchOperations({
        id: "bridge-1",
        parentId: "user-1",
        role: "user",
        isBridge: true,
      }),
    ).toEqual([]);
  });
});
