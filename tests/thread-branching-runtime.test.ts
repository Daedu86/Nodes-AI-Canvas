import { describe, expect, it, vi } from "vitest";
import type { ThreadRuntime } from "@assistant-ui/react";
import { buildBranchAppendMessage, executeBranchSpec } from "../lib/thread-branching-runtime";
import type { BranchSpec } from "../lib/thread-branching";

const baseSpec: BranchSpec = {
  operation: "new-root-prompt",
  anchorId: "__ROOT__",
  anchorRole: "ROOT",
  parentId: null,
  sourceId: null,
  targetRole: "user",
  startRun: true,
  placeholder: "Start another top-level branch...",
  title: "Create root branch",
};

describe("thread branching runtime", () => {
  it("builds append messages without losing a null parentId", () => {
    expect(
      buildBranchAppendMessage(baseSpec, {
        contextArtifacts: [
          {
            id: "artifact-1",
            artifactType: "text",
            title: "Requirement note",
            content: "Use React Flow",
            language: null,
          },
        ],
        contextNodeIds: ["artifact-1"],
        historyMode: "last",
        modelId: "nvidia/nemotron-3-super-120b-a12b:free",
        provider: "openrouter",
        text: "New root branch",
      }),
    ).toMatchObject({
      metadata: {
        custom: {
          contextNodeIds: ["artifact-1"],
        },
      },
      parentId: null,
      sourceId: null,
      role: "user",
      runConfig: {
        custom: {
          contextArtifacts: [
            {
              id: "artifact-1",
              title: "Requirement note",
            },
          ],
        },
      },
      startRun: true,
    });
  });

  it("uses the internal runtime append when available so null parentId is preserved", () => {
    const internalAppend = vi.fn();
    const publicAppend = vi.fn();
    const runtime = {
      append: publicAppend,
      __internal_threadBinding: {
        getState: () => ({
          append: internalAppend,
        }),
      },
    } as unknown as ThreadRuntime;

    const executed = executeBranchSpec(runtime, baseSpec, {
      historyMode: "last",
      modelId: "nvidia/nemotron-3-super-120b-a12b:free",
      provider: "openrouter",
      text: "Flow-created root branch",
    });

    expect(executed).toBe(true);
    expect(publicAppend).not.toHaveBeenCalled();
    expect(internalAppend).toHaveBeenCalledTimes(1);
    expect(internalAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        sourceId: null,
      }),
    );
  });

  it("falls back to the public append when no internal binding exists", () => {
    const publicAppend = vi.fn();
    const runtime = {
      append: publicAppend,
    } as unknown as ThreadRuntime;

    const executed = executeBranchSpec(runtime, baseSpec, {
      historyMode: "full",
      modelId: "stepfun/step-3.5-flash:free",
      provider: "openrouter",
      text: "Fallback branch",
    });

    expect(executed).toBe(true);
    expect(publicAppend).toHaveBeenCalledTimes(1);
    expect(publicAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        role: "user",
      }),
    );
  });

  it("rejects required canvas drafts without context and serializes scoped context", () => {
    expect(
      buildBranchAppendMessage(baseSpec, {
        historyMode: "full",
        modelId: "openrouter/free",
        provider: "openrouter",
        requireContextScope: true,
        text: "Canvas draft",
      }),
    ).toBeNull();

    expect(
      buildBranchAppendMessage(baseSpec, {
        contextMessages: [{ role: "user", content: "Earlier prompt" }],
        contextScope: "branch",
        historyMode: "full",
        modelId: "openrouter/free",
        provider: "openrouter",
        requireContextScope: true,
        text: "Canvas draft",
      }),
    ).toMatchObject({
      metadata: { custom: { contextScope: "branch" } },
      runConfig: {
        custom: {
          contextMessages: [{ role: "user", content: "Earlier prompt" }],
          contextScope: "branch",
        },
      },
    });
  });

  it("bounds durable full tree metadata without truncating the live run config", () => {
    const history: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
    }> = Array.from({ length: 80 }, (_, index) => ({
      id: `tree-node-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `${index}: ${"x".repeat(2_048)}`,
    }));
    const contextMessages = [
      ...history,
      { id: "current-prompt", role: "user" as const, content: "Summarize the full tree" },
    ];

    const message = buildBranchAppendMessage(baseSpec, {
      contextMessages,
      contextScope: "tree",
      historyMode: "full",
      modelId: "openrouter/free",
      provider: "openrouter",
      requireContextScope: true,
      text: "Summarize the full tree",
    });

    expect(message).not.toBeNull();
    if (!message) return;

    const durableMessages = message.metadata.custom.contextMessages;
    const liveMessages = message.runConfig.custom.contextMessages;

    expect(liveMessages).toHaveLength(contextMessages.length);
    expect(liveMessages).toEqual(contextMessages);
    expect(durableMessages.length).toBeLessThan(contextMessages.length);
    expect(JSON.stringify(durableMessages).length).toBeLessThanOrEqual(32 * 1024);
    expect(durableMessages[0]?.id).toBe("tree-node-0");
    expect(durableMessages.at(-1)).toMatchObject({
      id: "current-prompt",
      content: "Summarize the full tree",
    });
    expect(
      durableMessages.some((entry) => entry.content.includes("truncated in durable metadata")),
    ).toBe(true);
  });
});
