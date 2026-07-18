import { describe, expect, it } from "vitest";
import { normalizeCodexNotification } from "@/lib/agents/codex/event-mapper";

describe("normalizeCodexNotification", () => {
  it("maps agent message deltas", () => {
    const event = normalizeCodexNotification({
      runId: "run-1",
      threadId: "thread-1",
      notification: {
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", delta: "hello" },
      },
    });

    expect(event.type).toBe("agent.message.delta");
    expect(event.threadId).toBe("thread-1");
  });

  it("maps command execution items to shell events", () => {
    const event = normalizeCodexNotification({
      runId: "run-1",
      notification: {
        method: "item/started",
        params: { item: { type: "commandExecution" } },
      },
    });

    expect(event.type).toBe("shell.started");
  });

  it("maps approval requests", () => {
    const event = normalizeCodexNotification({
      runId: "run-1",
      notification: {
        method: "approval/requested",
        params: { approvalId: "approval-1" },
      },
    });

    expect(event.type).toBe("approval.requested");
  });

  it("maps runner child spawn notifications", () => {
    const event = normalizeCodexNotification({
      runId: "run-parent",
      notification: {
        method: "agent/child/spawned",
        params: {
          childRunId: "run-child",
          childThreadId: "thread-child",
          parentRunId: "run-parent",
        },
      },
    });

    expect(event.type).toBe("agent.child.spawned");
  });

  it("maps completed turns", () => {
    const event = normalizeCodexNotification({
      runId: "run-1",
      notification: {
        method: "turn/completed",
        params: { turn: { id: "turn-1", status: "completed" } },
      },
    });

    expect(event.type).toBe("run.completed");
  });
});
