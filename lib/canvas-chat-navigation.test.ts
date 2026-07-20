import { describe, expect, it } from "vitest";
import { focusCanvasMessageBranch } from "@/lib/canvas-chat-navigation";

describe("focusCanvasMessageBranch", () => {
  const repository = {
    headId: "assistant-main",
    messages: [
      { parentId: null, message: { id: "user-root" } },
      { parentId: "user-root", message: { id: "assistant-main" } },
      { parentId: "user-root", message: { id: "assistant-sibling" } },
      { parentId: "assistant-sibling", message: { id: "user-sibling-followup" } },
    ],
  };

  it("moves the visible head to a hidden sibling node", () => {
    const next = focusCanvasMessageBranch(repository, "assistant-sibling");
    expect(next).not.toBeNull();
    expect(next?.headId).toBe("assistant-sibling");
    expect(next?.messages).toBe(repository.messages);
  });

  it("can focus a descendant in the sibling branch", () => {
    const next = focusCanvasMessageBranch(repository, "user-sibling-followup");
    expect(next?.headId).toBe("user-sibling-followup");
  });

  it("does not mutate the repository for an unknown message", () => {
    expect(focusCanvasMessageBranch(repository, "missing-node")).toBeNull();
    expect(repository.headId).toBe("assistant-main");
  });
});
