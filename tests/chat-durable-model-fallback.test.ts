import { describe, expect, it } from "vitest";
import {
  chatRequestBodySchema,
  prepareChatRequest,
} from "../lib/server/chat/request";
import { resolveModelConfig } from "../lib/llm/config";

describe("durable Canvas model fallback", () => {
  it("propagates the saved model and provider into the body used by the executor", () => {
    const parsed = chatRequestBodySchema.parse({
      messages: [
        {
          id: "follow-up",
          role: "user",
          parts: [{ type: "text", text: "te pedi dos letras cuales fueron" }],
          metadata: {
            custom: {
              contextScope: "parent",
              contextMessages: [
                {
                  role: "user",
                  content:
                    "Continue from the saved assistant response below; treat it as conversation context.",
                },
                { id: "assistant-letters", role: "assistant", content: "ab" },
                { role: "user", content: "te pedi dos letras cuales fueron" },
              ],
              historyMode: "last",
              model: "openrouter/free",
              provider: "openrouter",
            },
          },
        },
      ],
    });

    const prepared = prepareChatRequest(parsed);

    expect(prepared.requestedModel).toEqual({
      modelId: "openrouter/free",
      provider: "openrouter",
    });
    expect(prepared.body.runConfig?.custom?.model).toBe("openrouter/free");
    expect(prepared.body.runConfig?.custom?.provider).toBe("openrouter");
    expect(resolveModelConfig(prepared.body)).toEqual({
      modelId: "openrouter/free",
      provider: "openrouter",
    });
    expect(prepared.messagesToSend.map((message) => [message.role, message.content])).toEqual([
      [
        "user",
        "Continue from the saved assistant response below; treat it as conversation context.",
      ],
      ["assistant", "ab"],
      ["user", "te pedi dos letras cuales fueron"],
    ]);
  });
});
