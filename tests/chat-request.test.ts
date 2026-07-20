import { describe, expect, it } from "vitest";
import {
  chatRequestBodySchema,
  INVALID_CHAT_REQUEST_CODE,
  parseChatRequest,
  prepareChatRequest,
} from "../lib/server/chat/request";
import {
  REQUEST_ERROR_CODE_HEADER,
  REQUEST_ERROR_MESSAGE_HEADER,
} from "../lib/llm/request-errors";

const validMessage = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text", text: "Hello" }],
};

describe("chat request validation", () => {
  it("accepts the current Assistant UI request envelope", () => {
    const result = chatRequestBodySchema.safeParse({
      id: "request-1",
      trigger: "submit-message",
      messages: [
        {
          ...validMessage,
          metadata: { custom: {} },
          sourceId: null,
        },
      ],
      system: "Be useful.",
      tools: {
        inspectCanvas: {
          description: "Inspect the current canvas",
          parameters: { type: "object" },
        },
      },
      runConfig: {
        custom: {
          contextArtifacts: [
            {
              id: "artifact-1",
              title: "Decision",
              artifactType: "text",
              semanticType: "decision",
              content: "Use strict request validation.",
              byteSize: 30,
            },
          ],
          historyMode: "full",
          model: "openrouter/free",
          provider: "openrouter",
        },
      },
      historyMode: "last",
      model: "openrouter/free",
      provider: "openrouter",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    const result = chatRequestBodySchema.safeParse({
      messages: [validMessage],
      provider: "openrouter",
      model: "openrouter/free",
      unexpected: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("rejects unknown nested model configuration", () => {
    const result = chatRequestBodySchema.safeParse({
      messages: [validMessage],
      runConfig: {
        custom: {
          historyMode: "last",
          unsupportedOption: true,
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts supported transport triggers and rejects invalid request values", () => {
    expect(
      chatRequestBodySchema.safeParse({
        id: "request-2",
        trigger: "regenerate-message",
        messages: [validMessage],
      }).success,
    ).toBe(true);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        trigger: "unsupported-trigger",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        provider: "unknown-provider",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        historyMode: "summary",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [{ id: "empty", role: "user" }],
      }).success,
    ).toBe(false);
  });

  it("preserves request precedence while preparing model context", () => {
    const parsed = chatRequestBodySchema.parse({
      messages: [validMessage],
      historyMode: "last",
      model: "openrouter/free",
      provider: "openrouter",
      runConfig: {
        historyMode: "last",
        custom: {
          historyMode: "full",
          model: "openrouter/free",
          provider: "openrouter",
        },
      },
      metadata: {
        historyMode: "last",
        custom: {
          historyMode: "full",
        },
      },
    });

    const prepared = prepareChatRequest(parsed);
    expect(prepared.historyMode).toBe("full");
    expect(prepared.messagesToSend).toHaveLength(1);
    expect(prepared.requestedModel).toEqual({
      modelId: "openrouter/free",
      provider: "openrouter",
    });
  });

  it("uses scoped messages and rejects them without an explicit context scope", () => {
    const withoutScope = chatRequestBodySchema.safeParse({
      messages: [validMessage],
      runConfig: { custom: { contextMessages: [{ role: "user", content: "Parent" }] } },
    });
    expect(withoutScope.success).toBe(false);

    const parsed = chatRequestBodySchema.parse({
      messages: [validMessage],
      runConfig: {
        custom: {
          contextScope: "branch",
          contextMessages: [
            { id: "u-1", role: "user", content: "First branch" },
            { id: "a-1", role: "assistant", content: "First reply" },
            { role: "user", content: "Current prompt" },
          ],
        },
      },
    });
    expect(prepareChatRequest(parsed).messagesToSend.map((message) => message.content)).toEqual([
      "First branch",
      "First reply",
      "Current prompt",
    ]);
  });

  it("converts full tree context into provider-safe reference context", () => {
    const parsed = chatRequestBodySchema.parse({
      messages: [validMessage],
      runConfig: {
        custom: {
          contextScope: "tree",
          historyMode: "full",
          contextMessages: [
            { id: "u-root", role: "user", content: "Dame 2 frutas" },
            { id: "a-root", role: "assistant", content: "manzana y pera" },
            { id: "u-colors", role: "user", content: "Dame un color para cada fruta" },
            { id: "a-colors", role: "assistant", content: "rojo y verde" },
            { id: "u-animals", role: "user", content: "Dame un animal para cada fruta" },
            { id: "a-animals", role: "assistant", content: "mono y oso" },
            { role: "user", content: "Cuales fueron todos los colores y animales?" },
          ],
        },
      },
    });

    const prepared = prepareChatRequest(parsed);
    expect(prepared.messagesToSend).toHaveLength(2);
    expect(prepared.messagesToSend[0]?.role).toBe("system");
    expect(prepared.messagesToSend[0]?.content).toContain("full conversation tree");
    expect(prepared.messagesToSend[0]?.content).toContain("rojo y verde");
    expect(prepared.messagesToSend[0]?.content).toContain("mono y oso");
    expect(prepared.messagesToSend[1]?.role).toBe("user");
    expect(prepared.messagesToSend[1]?.content).toBe(
      "Cuales fueron todos los colores y animales?",
    );
  });

  it("returns a structured error for malformed JSON", async () => {
    const result = await parseChatRequest(
      new Request("http://nodes.test/api/chat", {
        method: "POST",
        body: "{not-json}",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(400);
    expect(result.response.headers.get(REQUEST_ERROR_CODE_HEADER)).toBe(
      INVALID_CHAT_REQUEST_CODE,
    );
    expect(result.response.headers.get(REQUEST_ERROR_MESSAGE_HEADER)).toBe(
      "Invalid JSON body.",
    );
    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: INVALID_CHAT_REQUEST_CODE,
        message: "Invalid JSON body.",
      },
    });
  });
});
