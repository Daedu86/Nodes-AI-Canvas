"use strict";

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createUIMessageStream, createUIMessageStreamResponse, type ModelMessage, streamText } from "ai";
import { ollama } from "ollama-ai-provider";
import {
  getOpenRouterApiKey,
  resolveModelConfig,
  type ModelResolutionMetadata,
  type ModelResolutionRunConfig,
  type Provider,
} from "@/lib/llm/config";
import { buildContextArtifactsUserMessage } from "@/lib/llm/context-builder";
import { createE2eMockChatResponse, isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import { normalizeMessages, selectMessagesForHistoryMode } from "@/lib/llm/messages";
import { openrouterClient } from "@/lib/llm/openrouter";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { normalizeLlmContextArtifacts } from "@/lib/session-artifacts";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages?: unknown;
  system?: string;
  tools?: Parameters<typeof frontendTools>[0];
  runConfig?: ModelResolutionRunConfig;
  metadata?: ModelResolutionMetadata;
  historyMode?: string;
  model?: string;
  provider?: Provider;
};

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json()) as ChatRequestBody;
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = normalizeMessages(rawMessages);
  const system = body.system;
  const tools = body.tools;
  const contextArtifacts = normalizeLlmContextArtifacts(
    body.metadata?.custom?.contextArtifacts ??
      body.runConfig?.custom?.contextArtifacts,
  );

  const historyMode =
    body.metadata?.custom?.historyMode ??
    body.metadata?.historyMode ??
    body.runConfig?.custom?.historyMode ?? body.runConfig?.historyMode ?? body.historyMode;
  const messagesToSend = selectMessagesForHistoryMode(messages, historyMode);

  if (messagesToSend.length === 0) {
    const stream = createUIMessageStream({
      execute() {},
    });
    return createUIMessageStreamResponse({ stream });
  }

  if (isE2eMockLlmEnabled()) {
    const { modelId, provider } = resolveModelConfig(body);
    return createE2eMockChatResponse(messagesToSend, {
      contextArtifacts,
      historyMode,
      modelId,
      provider,
    });
  }

  try {
    const { modelId, provider } = resolveModelConfig(body);
    const model = (
      provider === "openrouter" ? openrouterClient(modelId) : ollama(modelId)
    ) as Parameters<typeof streamText>[0]["model"];

    if (provider === "openrouter" && !getOpenRouterApiKey()) {
      console.error("Missing OPENROUTER_API_KEY");
      return new Response("OpenRouter API key not configured", { status: 400 });
    }

    const toolset = tools ? { ...frontendTools(tools) } : undefined;
    const artifactContextMessage = buildContextArtifactsUserMessage(contextArtifacts, {
      modelId,
      provider,
    });
    const modelMessages = messagesToSend.map(
      ({ role, content }) =>
        ({
          role,
          content,
        }) satisfies ModelMessage,
    );
    const resolvedMessages = artifactContextMessage
      ? [artifactContextMessage satisfies ModelMessage, ...modelMessages]
      : modelMessages;

    const result = streamText({
      model,
      messages: resolvedMessages,
      system,
      tools: toolset,
      onError: console.error,
    });
    return result.toUIMessageStreamResponse({
      originalMessages: rawMessages as never[],
      onError: () => "The assistant request could not be completed.",
    });
  } catch (error) {
    console.error("/api/chat error:", error);
    return new Response("LLM backend unavailable", { status: 503 });
  }
}
