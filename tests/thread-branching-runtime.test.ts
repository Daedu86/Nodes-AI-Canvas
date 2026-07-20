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

const followUpSpec: BranchSpec = {
  operation: "create-follow-up-prompt",
  anchorId: "assistant-node-1",
  anchorRole: "assistant",
  parentId: "assistant-node-1",
  sourceId: "assistant-node-1",
  targetRole: "user",
  startRun: true,
  placeholder: "Continue this branch...",
  title: "Create follow-up message",
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

  it("uses the public append for non-root full-tree runs so transport lifecycle starts", () => {
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

    const executed = executeBranchSpec(runtime, followUpSpec, {
      contextMessages: [
        { id: "root-user", role: "user", content: "Give me two fruits" },
        { id: "root-assistant", role: "assistant", content: "apple and pear" },
        { id: "color-user", role: "user", content: "Give each fruit a color" },
        { id: "color-assistant", role: "assistant", content: "red and green" },
        { id: "animal-user", role: "user", content: "Give each fruit an animal" },
        { id: "animal-assistant", role: "assistant", content: "monkey and bear" },
        { id: "current-prompt", role: "user", content: "Which colors and animals were mentioned?" },
      ],
      contextScope: "tree",
      historyMode: "full",
      modelId: "openrouter/free",
      provider: "openrouter",
      requireContextScope: true,
      text: "Which colors and animals were mentioned?",
    });

    expect(executed).toBe(true);
    expect(internalAppend).not.toHaveBeenCalled();
    expect(publicAppend).toHaveBeenCalledTimes(1);
    expect(publicAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "assistant-node-1",
        startRun: true,
        metadata: {
          custom: expect.objectContaining({
            contextScope: "tree",
            contextMessages: expect.arrayContaining([
              expect.objectContaining({ content: "red and green" }),
              expect.objectContaining({ content: "monkey and bear" }),
            ]),
          }),
        },
        runConfig: {
          custom: expect.not.objectContaining({ contextMessages: expect.anything() }),
        },
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

  it("keeps full tree context in durable metadata but out of the live run config", () => {
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

    expect(liveMessages).toBeUndefined();
    expect(message.runConfig.custom).toMatchObject({
      contextScope: "tree",
      historyMode: "full",
      model: "openrouter/free",
      provider: "openrouter",
    });
    expect(durableMessages).toBeDefined();
    if (!durableMessages) return;

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
