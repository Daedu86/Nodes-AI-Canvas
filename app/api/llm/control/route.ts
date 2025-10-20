import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const maxDuration = 60;

const pexec = promisify(execFile);

type Payload = { action: "start" | "stop"; model?: string };

function getOllamaBase() {
  const base = process.env.OLLAMA_API_URL || "http://127.0.0.1:11434/api";
  return base.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400 });
  }

  const action = body?.action;
  const model = body?.model || "gemma3:4b";

  if (action !== "start" && action !== "stop") {
    return new Response(JSON.stringify({ ok: false, error: "Invalid action" }), { status: 400 });
  }

  try {
    if (action === "start") {
      // Ensure model exists and warm it up via Ollama HTTP API
      const base = getOllamaBase();

      // Pull (idempotent). Some Ollama versions require name
      {
        const res = await fetch(`${base}/pull`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: model, stream: false }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`pull failed: ${res.status} ${txt}`);
        }
      }

      // Warm with tiny generate
      {
        const res = await fetch(`${base}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt: "ok", stream: false, options: { num_predict: 5 } }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`generate failed: ${res.status} ${txt}`);
        }
      }

      return Response.json({ ok: true, status: "started", model });
    } else {
      // Try to stop the model via CLI (simplest and broadly supported)
      // Requires 'ollama' on PATH. If unavailable, surface a clear error.
      try {
        await pexec(process.env.OLLAMA_CMD || "ollama", ["stop", model], { timeout: 30000 });
        return Response.json({ ok: true, status: "stopped", model });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
        return new Response(
          JSON.stringify({ ok: false, error: `ollama stop failed: ${message}` }),
          { status: 500 }
        );
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
}
