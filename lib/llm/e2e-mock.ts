import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";
import type { NormalizedLlmMessage } from "@/lib/llm/messages";
import type { LlmContextArtifact } from "@/lib/session-artifacts";

const DEFAULT_E2E_TITLE = "E2E Mock Chat";
type E2eMockChatContext = {
  contextArtifacts?: LlmContextArtifact[];
  historyMode?: string;
  modelId: string;
  provider: string;
};

export function isE2eMockLlmEnabled() {
  return process.env.E2E_MOCK_LLM === "1";
}

function getLastUserMessage(messages: NormalizedLlmMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim().length > 0);
}

export function buildE2eMockAssistantText(messages: NormalizedLlmMessage[]) {
  const lastUserMessage = getLastUserMessage(messages);
  if (!lastUserMessage) {
    return "E2E reply";
  }

  return `E2E reply: ${lastUserMessage.content.trim()}`;
}

export function buildE2eMockTitle(messages: NormalizedLlmMessage[]) {
  const lastUserMessage = getLastUserMessage(messages);
  if (!lastUserMessage) {
    return DEFAULT_E2E_TITLE;
  }

  const words = lastUserMessage.content
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);

  return words.join(" ") || DEFAULT_E2E_TITLE;
}

export function createE2eMockChatResponse(
  messages: NormalizedLlmMessage[],
  context: E2eMockChatContext,
) {
  const text = buildE2EText(messages, context);
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const messageId = generateId();
      const textId = generateId();

      writer.write({ type: "start", messageId });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function buildE2EText(messages: NormalizedLlmMessage[], context: E2eMockChatContext) {
  const baseReply = buildE2eMockAssistantText(messages);
  const history = context.historyMode === "full" ? "full" : "last";
  const artifacts = context.contextArtifacts ?? [];
  const contextSummary = artifacts.length
    ? ` context=${artifacts.length} contextTitles=${artifacts.map((artifact) => artifact.title).join("|")}`
    : "";
  return `${baseReply} [provider=${context.provider} model=${context.modelId} history=${history} count=${messages.length}${contextSummary}]`;
}
