import { ollama } from "ollama-ai-provider";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { streamText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, system, tools } = body;
  const historyMode = (body?.runConfig?.custom?.historyMode ?? body?.runConfig?.historyMode ?? body?.historyMode);

  // History mode: "full" sends the whole thread; default sends only the last user question.
  const isFullHistory = historyMode === "full";
  const lastUserMessage = [...(messages ?? [])].reverse().find((m: any) => m?.role === "user");
  const messagesToSend = isFullHistory
    ? messages
    : lastUserMessage
      ? [lastUserMessage]
      : (Array.isArray(messages) && messages.length > 0 ? [messages[messages.length - 1]] : []);

  console.log("Mensajes originales recibidos:", messages);
  console.log("Mensajes enviados al modelo (" + (isFullHistory ? "historial completo" : "solo ultima pregunta") + "):", messagesToSend);

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
  } catch (err) {
    console.error("/api/chat error:", err);
    return new Response("LLM backend unavailable", { status: 503 });
  }
}

