"use strict";

import { generateText } from "ai";
import { NextResponse } from "next/server";
import {
  resolveModelConfig,
  type Provider,
} from "@/lib/llm/config";
import { buildE2eMockTitle, isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import { normalizeMessages, toPlainTextTranscript } from "@/lib/llm/messages";
import {
  createLanguageModel,
  getMissingProviderCredential,
  getUserModelOverrides,
} from "@/lib/llm/provider-runtime";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";
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
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const requestOverrides = await getUserModelOverrides(guarded.user.id);
    const { messages: maybeMessages, model, provider: maybeProvider }: TitleRequestBody = await req.json();
    const messages = normalizeMessages(Array.isArray(maybeMessages) ? maybeMessages : []);

    if (isE2eMockLlmEnabled()) {
      return NextResponse.json({ title: sanitizeTitle(buildE2eMockTitle(messages)) });
    }

    const { modelId, provider } = resolveModelConfig({ model, provider: maybeProvider });
    const missingCredential = getMissingProviderCredential(provider, requestOverrides);
    if (missingCredential) {
      return NextResponse.json({ error: missingCredential.message }, { status: missingCredential.status });
    }

    const convo = toPlainTextTranscript(messages);
    const modelInstance = createLanguageModel(
      { modelId, provider },
      requestOverrides,
    ) as Parameters<typeof generateText>[0]["model"];
    const result = await generateText({
      model: modelInstance,
      prompt: `Conversation:\n${convo}\n\nTitle:`,
      system:
        "Write a short descriptive chat title. Return only 2 to 5 words without quotes or trailing punctuation.",
    });
    return NextResponse.json({ title: sanitizeTitle(result.text) });
  } catch (error) {
    console.error("/api/title error:", error);
    return NextResponse.json({ error: "Unable to generate a title right now." }, { status: 500 });
  }
}
