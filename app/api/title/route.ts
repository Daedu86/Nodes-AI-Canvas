"use strict";

import { NextResponse } from "next/server";
import {
  getOpenRouterApiKey,
  getOpenRouterMetadataHeaders,
  OLLAMA_API_URL,
  OPENROUTER_BASE_URL,
  resolveModelConfig,
  type Provider,
} from "@/lib/llm/config";
import { buildE2eMockTitle, isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import { normalizeMessages, toPlainTextTranscript } from "@/lib/llm/messages";

export const runtime = "edge";
export const maxDuration = 15;

type TitleRequestBody = {
  messages?: unknown;
  model?: string;
  provider?: Provider;
};

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
    const { messages: maybeMessages, model, provider: maybeProvider }: TitleRequestBody = await req.json();
    const messages = normalizeMessages(Array.isArray(maybeMessages) ? maybeMessages : []);

    if (isE2eMockLlmEnabled()) {
      return NextResponse.json({ title: sanitizeTitle(buildE2eMockTitle(messages)) });
    }

    const { modelId, provider } = resolveModelConfig({ model, provider: maybeProvider });

    const convo = toPlainTextTranscript(messages);
    const prompt = `You are a helpful assistant that writes short, descriptive chat titles.\n\nGiven the conversation below, respond with ONLY a concise title of 2 to 5 words.\nDo not include quotes or trailing punctuation.\n\nConversation:\n${convo}\n\nTitle:`;

    if (provider === "openrouter") {
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) {
        return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 400 });
      }
      const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...getOpenRouterMetadataHeaders(),
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      if (!resp.ok) {
        return NextResponse.json(
          { error: `openrouter title failed: ${resp.status}` },
          { status: 500 },
        );
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const title = sanitizeTitle(raw);
      return NextResponse.json({ title });
    }

    const resp = await fetch(`${OLLAMA_API_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, prompt, stream: false }),
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
