import { describe, expect, it } from "vitest";
import {
  normalizeThreadRepoItems,
  type ThreadRepoItem,
} from "../components/assistant-ui/use-thread-repo-items";
import {
  ASSISTANT_EDIT_METADATA_KEY,
  ASSISTANT_EDIT_BRIDGE_KEY,
  EDIT_SOURCE_KEY,
} from "../lib/assistant-edit-branching";

const makeItem = ({
  id,
  role,
  parentId,
  custom,
  sourceId,
}: {
  id: string;
  role: "user" | "assistant";
  parentId: string | null;
  custom?: Record<string, unknown>;
  sourceId?: string;
}): ThreadRepoItem => ({
  parentId,
  message: {
    id,
    role,
    content: [],
    ...(sourceId ? { sourceId } : {}),
    metadata: custom ? { custom } : undefined,
  } as ThreadRepoItem["message"],
});

describe("normalizeThreadRepoItems", () => {
  it("reparents assistant edits under their bridge and removes sibling linkage", () => {
    const rootUser = makeItem({ id: "root-user", role: "user", parentId: null });
    const originalAssistant = makeItem({
      id: "assistant-1",
      role: "assistant",
      parentId: "root-user",
    });
    const bridgeUser = makeItem({
      id: "bridge-user",
      role: "user",
      parentId: "root-user",
      custom: {
        [EDIT_SOURCE_KEY]: "assistant-1",
      },
    });
    const assistantEdit = makeItem({
      id: "assistant-edit",
      role: "assistant",
      parentId: "root-user",
      custom: {
        [ASSISTANT_EDIT_METADATA_KEY]: "assistant-1",
      },
    });

    const { items, bridges } = normalizeThreadRepoItems([
      bridgeUser,
      assistantEdit,
      rootUser,
      originalAssistant,
    ]);

    const byId = new Map(items.map((item) => [item.message?.id, item]));
    const normalizedBridge = byId.get("bridge-user");
    const normalizedEdit = byId.get("assistant-edit");
    expect(normalizedBridge?.parentId).toBe("root-user");
    expect(normalizedEdit?.parentId).toBe("bridge-user");
    expect(
      (normalizedEdit?.message.metadata as { custom?: Record<string, unknown> } | undefined)
        ?.custom?.[ASSISTANT_EDIT_BRIDGE_KEY],
    ).toBe("bridge-user");

    const childrenOfRoot = items
      .filter((item) => item.parentId === "root-user")
      .map((item) => item.message?.id)
      .sort();
    expect(childrenOfRoot).toEqual(["assistant-1", "bridge-user"]);

    const childrenOfBridge = items
      .filter((item) => item.parentId === "bridge-user")
      .map((item) => item.message?.id);
    expect(childrenOfBridge).toContain("assistant-edit");

    const siblingsOfBridge = items
      .filter((item) => item.parentId === "root-user" && item.message?.id !== "bridge-user")
      .map((item) => item.message?.id)
      .sort();
    expect(siblingsOfBridge).toEqual(["assistant-1"]);

    expect(bridges.has("bridge-user")).toBe(true);
  });
});
