import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";
export const maxDuration = 60;

type Payload = { action: "start" | "stop"; model?: string };
type JsonBody = { ok: boolean; error?: string; model?: string; status?: string };

function json(body: JsonBody, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isOllamaControlEnabled() {
  return process.env.ENABLE_OLLAMA_CONTROL_ROUTE === "1";
}

function getOllamaBase() {
  const base = process.env.OLLAMA_API_URL || "http://127.0.0.1:11434/api";
  return base.replace(/\/$/, "");
}

function execFileAsync(file: string, args: string[], timeout = 30_000) {
  return new Promise<void>((resolve, reject) => {
    execFile(file, args, { timeout }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function POST(req: NextRequest) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  if (!isOllamaControlEnabled()) {
    return json(
      {
        ok: false,
        error:
          "Ollama control route is disabled. Set ENABLE_OLLAMA_CONTROL_ROUTE=1 to enable local model lifecycle controls.",
      },
      404,
    );
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const action = body?.action;
  const model = body?.model || "gemma3:4b";

  if (action !== "start" && action !== "stop") {
    return json({ ok: false, error: "Invalid action" }, 400);
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

      return json({ ok: true, status: "started", model });
    } else {
      // Try to stop the model via CLI (simplest and broadly supported)
      // Requires 'ollama' on PATH. If unavailable, surface a clear error.
      try {
        await execFileAsync(process.env.OLLAMA_CMD || "ollama", ["stop", model]);
        return json({ ok: true, status: "stopped", model });
      } catch (error) {
        console.error("ollama stop failed", error);
        return json({ ok: false, error: "Unable to stop the Ollama model." }, 500);
      }
    }
  } catch (error) {
    console.error("ollama control failed", error);
    return json({ ok: false, error: "Unable to control the Ollama model." }, 500);
  }
}
