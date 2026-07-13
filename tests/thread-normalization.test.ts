import { describe, expect, it } from "vitest";
import {
  normalizeThreadRepoItems,
  type ThreadRepoItem,
} from "../components/assistant-ui/use-thread-repo-items";
import {
  ASSISTANT_EDIT_METADATA_KEY,
  ASSISTANT_EDIT_BRIDGE_KEY,
  EDIT_SOURCE_KEY,
  EDIT_PARENT_KEY,
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
  } as unknown as ThreadRepoItem["message"],
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
        [EDIT_PARENT_KEY]: "root-user",
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

  it("reparents assistant edits when the bridge uses sourceId instead of custom metadata", () => {
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
      sourceId: "assistant-1",
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
      rootUser,
      originalAssistant,
      bridgeUser,
      assistantEdit,
    ]);

    const byId = new Map(items.map((item) => [item.message?.id, item]));
    expect(byId.get("assistant-edit")?.parentId).toBe("bridge-user");
    expect(bridges.has("bridge-user")).toBe(true);
  });

  it("honors persisted bridge metadata when a normalized export is reloaded", () => {
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
        [ASSISTANT_EDIT_BRIDGE_KEY]: "bridge-user",
        [EDIT_PARENT_KEY]: "root-user",
      },
    });

    const { items } = normalizeThreadRepoItems([
      rootUser,
      originalAssistant,
      bridgeUser,
      assistantEdit,
    ]);

    const byId = new Map(items.map((item) => [item.message?.id, item]));
    const normalizedEdit = byId.get("assistant-edit");
    expect(normalizedEdit?.parentId).toBe("bridge-user");
    expect(
      (normalizedEdit?.message.metadata as { custom?: Record<string, unknown> } | undefined)
        ?.custom?.[ASSISTANT_EDIT_BRIDGE_KEY],
    ).toBe("bridge-user");
    expect(
      (normalizedEdit?.message.metadata as { custom?: Record<string, unknown> } | undefined)
        ?.custom?.[ASSISTANT_EDIT_METADATA_KEY],
    ).toBe("assistant-1");
  });
});
