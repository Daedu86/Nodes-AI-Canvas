import { describe, expect, it } from "vitest";
import {
  getCanvasFlowRenderModeStorageKey,
  resolveCanvasFocusedMessageId,
} from "@/components/assistant-ui/thread-graph-flow/use-canvas-session-state";

describe("canvas session state helpers", () => {
  it("scopes the render mode key to the active session", () => {
    expect(getCanvasFlowRenderModeStorageKey("session-42")).toBe(
      "nodes.canvas.render-mode.v1:session-42",
    );
    expect(getCanvasFlowRenderModeStorageKey(null)).toBe(
      "nodes.canvas.render-mode.v1:unknown",
    );
  });

  it("focuses conversation nodes and clears focus for canvas-only nodes", () => {
    expect(
      resolveCanvasFocusedMessageId({
        nodeId: "message-1",
        hasArtifact: false,
        hasConversationNode: true,
        hasPrompt: false,
      }),
    ).toBe("message-1");
    expect(
      resolveCanvasFocusedMessageId({
        nodeId: "artifact-1",
        hasArtifact: true,
        hasConversationNode: false,
        hasPrompt: false,
      }),
    ).toBeNull();
  });

  it("preserves focused message state for unknown external selections", () => {
    expect(
      resolveCanvasFocusedMessageId({
        nodeId: "unknown",
        hasArtifact: false,
        hasConversationNode: false,
        hasPrompt: false,
      }),
    ).toBeUndefined();
  });
});
