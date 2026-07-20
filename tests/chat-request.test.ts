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
          contextScope: "tree",
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

  it("recovers scoped parent context from durable message metadata when runConfig is missing", () => {
    const parsed = chatRequestBodySchema.parse({
      messages: [
        {
          id: "follow-up",
          role: "user",
          parts: [{ type: "text", text: "de esas letras que me diste dame 1 palabra de cada una" }],
          metadata: {
            custom: {
              branchAnchorId: "assistant-1",
              branchOperation: "create-follow-up-prompt",
              contextScope: "parent",
              contextMessages: [
                {
                  role: "user",
                  content:
                    "Continue from the saved assistant response below; treat it as conversation context.",
                },
                { id: "assistant-1", role: "assistant", content: "A y B" },
                {
                  role: "user",
                  content: "de esas letras que me diste dame 1 palabra de cada una",
                },
              ],
              historyMode: "last",
              model: "openrouter/free",
              provider: "openrouter",
            },
          },
        },
      ],
      model: "openrouter/free",
      provider: "openrouter",
    });

    const prepared = prepareChatRequest(parsed);
    expect(prepared.historyMode).toBe("last");
    expect(prepared.messagesToSend.map((message) => [message.role, message.content])).toEqual([
      [
        "user",
        "Continue from the saved assistant response below; treat it as conversation context.",
      ],
      ["assistant", "A y B"],
      ["user", "de esas letras que me diste dame 1 palabra de cada una"],
    ]);
  });

  it("does not reuse durable scoped context from an older message", () => {
    const parsed = chatRequestBodySchema.parse({
      messages: [
        {
          id: "old-branch-prompt",
          role: "user",
          parts: [{ type: "text", text: "old branch question" }],
          metadata: {
            custom: {
              contextScope: "parent",
              contextMessages: [
                { role: "assistant", content: "Old parent context" },
                { role: "user", content: "old branch question" },
              ],
              historyMode: "last",
            },
          },
        },
        {
          id: "current-prompt",
          role: "user",
          parts: [{ type: "text", text: "brand new question" }],
        },
      ],
      historyMode: "full",
    });

    const prepared = prepareChatRequest(parsed);
    expect(prepared.messagesToSend.map((message) => message.content)).toEqual([
      "old branch question",
      "brand new question",
    ]);
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
