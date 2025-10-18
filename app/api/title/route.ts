import { NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 15;

type LMMessage = { role: string; content: Array<{ type: string; text?: string }>|string };

function toPlainText(messages: LMMessage[] = []): string {
  const parts: string[] = [];
  for (const m of messages) {
    let text = "";
    if (typeof (m as any).content === "string") {
      text = (m as any).content as string;
    } else if (Array.isArray((m as any).content)) {
      text = ((m as any).content as any[])
        .map((c) => (c && typeof c.text === "string" ? c.text : ""))
        .filter(Boolean)
        .join("\n");
    }
    if (!text) continue;
    parts.push(`${m.role}: ${text}`);
  }
  return parts.join("\n");
}

function sanitizeTitle(s: string): string {
  const cleaned = s
    .replace(/[\"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\.!?\-–—:,;]+$/g, "");
  // limit to 5 words max
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  return words.join(" ") || "New Chat";
}

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    const baseUrl = process.env.OLLAMA_API_URL || "http://localhost:11434/api";
    const ollamaModel = typeof model === "string" && model.length > 0 ? model : "gemma3:4b";

    const convo = toPlainText(messages || []);
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

    const data = await resp.json();
    const raw = (data?.response as string) ?? "";
    const title = sanitizeTitle(raw);
    return NextResponse.json({ title });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

