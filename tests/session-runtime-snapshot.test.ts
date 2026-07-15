import { describe, expect, it } from "vitest";
import type { SessionThreadExport } from "../lib/session-documents";
import {
  mergeRuntimeBranchIntoSessionSnapshot,
  mergeSessionSnapshotRepositories,
} from "../lib/session-runtime-snapshot";

const message = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  content: [{ type: "text", text }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  metadata: { custom: {} },
  ...(role === "assistant"
    ? { status: { type: "complete", reason: "stop" } }
    : { attachments: [] }),
});

describe("mergeSessionSnapshotRepositories", () => {
  it("preserves inactive branches while newer repositories replace matching ids", () => {
    const root = message("root", "user", "Question");
    const oldAssistant = message("old", "assistant", "Old answer");
    const updatedRoot = message("root", "user", "Updated question");
    const newAssistant = message("new", "assistant", "New answer");

    const merged = mergeSessionSnapshotRepositories(
      {
        headId: "old",
        messages: [
          { parentId: null, message: root },
          { parentId: "root", message: oldAssistant },
        ],
      },
      {
        headId: "new",
        messages: [
          { parentId: null, message: updatedRoot },
          { parentId: "root", message: newAssistant },
        ],
      },
    );

    expect(merged.headId).toBe("new");
    expect(merged.messages).toHaveLength(3);
    expect(merged.messages[0]?.message).toEqual(updatedRoot);
    expect(merged.messages).toContainEqual({ parentId: "root", message: oldAssistant });
    expect(merged.messages).toContainEqual({ parentId: "root", message: newAssistant });
  });

  it("preserves a persisted context scope when the runtime export omits it", () => {
    const persisted = message("root", "user", "Question");
    persisted.metadata.custom = { contextScope: "tree" };
    const runtime = message("root", "user", "Question");
    const merged = mergeSessionSnapshotRepositories(
      { headId: "root", messages: [{ parentId: null, message: persisted }] },
      { headId: "root", messages: [{ parentId: null, message: runtime }] },
    );
    expect(merged.messages[0]?.message.metadata).toMatchObject({
      custom: { contextScope: "tree" },
    });
  });
});

describe("mergeRuntimeBranchIntoSessionSnapshot", () => {
  it("adds the assistant message visible in the active runtime branch", () => {
    const user = message("user-1", "user", "Hello");
    const assistant = message("assistant-1", "assistant", "Hi");
    const repository: SessionThreadExport = {
      headId: "user-1",
      messages: [{ parentId: null, message: user }],
    };
    expect(mergeRuntimeBranchIntoSessionSnapshot(repository, [user, assistant])).toEqual({
      headId: "assistant-1",
      messages: [
        { parentId: null, message: user },
        { parentId: "user-1", message: assistant },
      ],
    });
  });

  it("preserves messages from inactive branches", () => {
    const root = message("root", "user", "Question");
    const oldAssistant = message("old", "assistant", "Old answer");
    const newAssistant = message("new", "assistant", "New answer");
    const repository: SessionThreadExport = {
      headId: "old",
      messages: [
        { parentId: null, message: root },
        { parentId: "root", message: oldAssistant },
      ],
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(repository, [root, newAssistant]);
    expect(merged.headId).toBe("new");
    expect(merged.messages).toContainEqual({ parentId: "root", message: oldAssistant });
    expect(merged.messages).toContainEqual({ parentId: "root", message: newAssistant });
  });

  it("replaces a substantive optimistic assistant with one stable child", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", "Rendered answer"),
      metadata: { custom: {}, isOptimistic: true },
    };
    const whileStreaming = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(whileStreaming.headId).toBe("root");
    expect(whileStreaming.messages).toEqual([{ parentId: null, message: root }]);

    const stable = message("server-assistant", "assistant", "Rendered answer");
    const settled = mergeRuntimeBranchIntoSessionSnapshot(whileStreaming, [root, stable]);
    expect(settled.headId).toBe("server-assistant");
    expect(settled.messages).toEqual([
      { parentId: null, message: root },
      { parentId: "root", message: stable },
    ]);
    expect(
      settled.messages.filter(
        (entry) => entry.parentId === "root" && entry.message.role === "assistant",
      ),
    ).toHaveLength(1);
  });

  it("does not persist empty optimistic placeholders", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", ""),
      content: [],
      metadata: { custom: {}, isOptimistic: true },
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(merged.headId).toBe("root");
    expect(merged.messages).toHaveLength(1);
  });
});
