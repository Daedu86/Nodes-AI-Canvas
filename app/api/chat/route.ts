"use strict";

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { streamText } from "ai";
import { ollama } from "ollama-ai-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: string;
  content?: unknown;
  [key: string]: unknown;
};

type ChatRunConfig = {
  historyMode?: string;
  custom?: {
    historyMode?: string;
  };
};

type ChatRequestBody = {
  messages?: unknown;
  system?: string;
  tools?: Parameters<typeof frontendTools>[0];
  runConfig?: ChatRunConfig;
  historyMode?: string;
};

const isChatMessage = (value: unknown): value is ChatMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { role?: unknown }).role === "string";

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = rawMessages.filter(isChatMessage);
  const system = body.system;
  const tools = body.tools;

  const historyMode =
    body.runConfig?.custom?.historyMode ?? body.runConfig?.historyMode ?? body.historyMode;

  const isFullHistory = historyMode === "full";
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const messagesToSend: ChatMessage[] = isFullHistory
    ? messages
    : lastUserMessage
      ? [lastUserMessage]
      : messages.length > 0
        ? [messages[messages.length - 1]]
        : [];

  console.log("Mensajes originales recibidos:", messages);
  console.log(
    `Mensajes enviados al modelo (${isFullHistory ? "historial completo" : "solo ultima pregunta"}):`,
    messagesToSend
  );

  try {
    const result = streamText({
      model: ollama("gemma3:4b"),
      messages: messagesToSend,
      toolCallStreaming: true,
      system,
      tools: {
        ...frontendTools(tools),
      },
      onError: console.error,
    });
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("/api/chat error:", error);
    return new Response("LLM backend unavailable", { status: 503 });
  }
}
