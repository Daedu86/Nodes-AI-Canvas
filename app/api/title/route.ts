"use strict";

import { NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 15;

type LMMessageContent = { type: string; text?: string };
type LMMessage = { role: string; content: string | LMMessageContent[] };
type TitleRequestBody = {
  messages?: LMMessage[];
  model?: string;
};

const isLMMessageContent = (value: unknown): value is LMMessageContent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

const isLMMessage = (value: unknown): value is LMMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { role?: unknown }).role === "string" &&
  "content" in (value as Record<string, unknown>);

function toPlainText(messages: LMMessage[] = []): string {
  const parts: string[] = [];
  messages.forEach((message) => {
    const { content } = message;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.filter(isLMMessageContent).map((item) => item.text ?? "").filter(Boolean).join("\n");
    }
    if (text) {
      parts.push(`${message.role}: ${text}`);
    }
  });
  return parts.join("\n");
}

function sanitizeTitle(value: string): string {
  const cleaned = value
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?":,;-]+$/g, "");
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  return words.join(" ") || "New Chat";
}

export async function POST(req: Request) {
  try {
    const { messages: maybeMessages, model }: TitleRequestBody = await req.json();
    const messages = Array.isArray(maybeMessages) ? maybeMessages.filter(isLMMessage) : [];

    const baseUrl = process.env.OLLAMA_API_URL || "http://localhost:11434/api";
    const ollamaModel = typeof model === "string" && model.length > 0 ? model : "gemma3:4b";

    const convo = toPlainText(messages);
    const prompt = `You are a helpful assistant that writes short, descriptive chat titles.\n\nGiven the conversation below, respond with ONLY a concise title of 2 to 5 words.\nDo not include quotes or trailing punctuation.\n\nConversation:\n${convo}\n\nTitle:`;

    const resp = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `ollama generate failed: ${resp.status}` },
        { status: 500 },
      );
    }

    const data = (await resp.json()) as { response?: string };
    const raw = data.response ?? "";
    const title = sanitizeTitle(raw);
    return NextResponse.json({ title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
