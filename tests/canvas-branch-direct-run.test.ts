import { describe, expect, it } from "vitest";
import type { MessageFormatRepository } from "@assistant-ui/core";
import type { UIMessage } from "ai";
import {
  appendCompletedCanvasBranch,
  buildCanvasBranchRunRequest,
  buildCanvasBranchSystemContext,
} from "../lib/canvas-branch-direct-run";
import { buildBranchAppendMessage } from "../lib/thread-branching-runtime";

const treeContext = [
  { id: "root-user", role: "user" as const, content: "Dame 2 frutas" },
  {
    id: "root-assistant",
    role: "assistant" as const,
    content: "manzana y pera",
  },
  { id: "color-user", role: "user" as const, content: "Dame colores" },
  {
    id: "color-assistant",
    role: "assistant" as const,
    content: "rojo y verde",
  },
  { id: "animal-user", role: "user" as const, content: "Dame animales" },
  {
    id: "animal-assistant",
    role: "assistant" as const,
    content: "mono y oso",
  },
  {
    role: "user" as const,
    content: "¿Cuáles fueron todos los colores y animales?",
  },
];

describe("direct Canvas branching", () => {
  it("serializes Parent context without duplicating the current prompt", () => {
    const system = buildCanvasBranchSystemContext(
      [
        {
          role: "user",
          content: "Continue from the saved assistant response below",
        },
        { role: "assistant", content: "A y B" },
        { role: "user", content: "Dame una palabra por letra" },
      ],
      "parent",
      "Dame una palabra por letra",
    );

    expect(system).toContain("role=assistant");
    expect(system).toContain("A y B");
    expect(system).not.toContain("Dame una palabra por letra");
  });

  it("serializes Branch lineage", () => {
    const system = buildCanvasBranchSystemContext(
      [
        { role: "user", content: "Dame 2 frutas" },
        { role: "assistant", content: "manzana y pera" },
        { role: "user", content: "Dame animales" },
        { role: "assistant", content: "mono y oso" },
        { role: "user", content: "Resume la rama" },
      ],
      "branch",
      "Resume la rama",
    );

    expect(system).toContain("manzana y pera");
    expect(system).toContain("mono y oso");
    expect(system).not.toContain("Resume la rama");
  });

  it("includes sibling facts in Full Tree context", () => {
    const system = buildCanvasBranchSystemContext(
      treeContext,
      "tree",
      "¿Cuáles fueron todos los colores y animales?",
    );

    expect(system).toContain("full conversation tree");
    expect(system).toContain("rojo y verde");
    expect(system).toContain("mono y oso");
    expect(system).not.toContain("¿Cuáles fueron todos los colores y animales?");
  });

  it("builds a Full Tree request and commits anchor -> user -> assistant", () => {
    const userMessage = buildBranchAppendMessage(
      {
        operation: "create-follow-up-prompt",
        anchorId: "root-assistant",
        anchorRole: "assistant",
        parentId: "root-assistant",
        sourceId: "root-assistant",
        targetRole: "user",
        startRun: true,
        placeholder: "Continue",
        title: "Follow up",
      },
      {
        contextMessages: treeContext,
        contextScope: "tree",
        historyMode: "full",
        modelId: "openrouter/free",
        provider: "openrouter",
        requireContextScope: true,
        text: "¿Cuáles fueron todos los colores y animales?",
      },
    );

    expect(userMessage).not.toBeNull();
    if (!userMessage) return;

    const request = buildCanvasBranchRunRequest({
      contextMessages: treeContext,
      contextScope: "tree",
      model: "openrouter/free",
      outputArtifactTypes: [],
      prompt: "¿Cuáles fueron todos los colores y animales?",
      promptId: userMessage.id,
      provider: "openrouter",
      runId: "response-1",
    });

    expect(request.system).toContain("rojo y verde");
    expect(request.system).toContain("mono y oso");

    const externalState: MessageFormatRepository<UIMessage> = {
      headId: "root-assistant",
      messages: [
        {
          parentId: null,
          message: {
            id: "root-user",
            role: "user",
            parts: [{ type: "text", text: "Dame 2 frutas" }],
          },
        },
        {
          parentId: "root-user",
          message: {
            id: "root-assistant",
            role: "assistant",
            parts: [{ type: "text", text: "manzana y pera" }],
          },
        },
      ],
    };

    const completed = appendCompletedCanvasBranch({
      externalState,
      modelId: "openrouter/free",
      provider: "openrouter",
      responseId: "response-1",
      responseText: "Los colores fueron rojo y verde; los animales, mono y oso.",
      userMessage,
    });

    expect(completed.headId).toBe("response-1");
    expect(completed.messages.at(-2)?.parentId).toBe("root-assistant");
    expect(completed.messages.at(-2)?.message.id).toBe(userMessage.id);
    expect(completed.messages.at(-1)?.parentId).toBe(userMessage.id);
    expect(completed.messages.at(-1)?.message.id).toBe("response-1");
  });
});
