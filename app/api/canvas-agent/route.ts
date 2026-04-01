import { NextResponse } from "next/server";
import { generateText } from "ai";
import { ollama } from "ollama-ai-provider";
import {
  buildCanvasGuideSystemPrompt,
  buildCanvasGuideUserPrompt,
  getCanvasGuideActionLabel,
  type CanvasGuideAction,
  type CanvasGuidePayload,
} from "@/lib/canvas-agent/canvas-agent-context";
import {
  getOpenRouterApiKey,
  resolveModelConfig,
  type Provider,
} from "@/lib/llm/config";
import { isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import { openrouterClient } from "@/lib/llm/openrouter";
import { enforceLocalApiAccess } from "@/lib/server/api-access";

export const runtime = "nodejs";
export const maxDuration = 30;

type CanvasAgentRequestBody = {
  action?: CanvasGuideAction;
  payload?: CanvasGuidePayload;
  model?: string;
  provider?: Provider;
};

const buildE2eMockCanvasGuideText = (action: CanvasGuideAction, payload: CanvasGuidePayload) => {
  const focusLabel = payload.focus.label;
  return `Canvas guide: ${getCanvasGuideActionLabel(action)} on ${focusLabel} [tree=${payload.tree.nodeCount} artifacts=${payload.tree.artifactCount} branch=${payload.branch.nodeCount}]`;
};

export async function POST(req: Request) {
  const accessError = enforceLocalApiAccess(req);
  if (accessError) return accessError;

  try {
    const body = (await req.json()) as CanvasAgentRequestBody;
    const action = body.action;
    const payload = body.payload;

    if (!action || !payload) {
      return NextResponse.json({ error: "Missing canvas agent payload" }, { status: 400 });
    }

    if (isE2eMockLlmEnabled()) {
      return NextResponse.json({
        text: buildE2eMockCanvasGuideText(action, payload),
      });
    }

    const { modelId, provider } = resolveModelConfig({
      model: body.model,
      provider: body.provider,
    });
    const model = (
      provider === "openrouter" ? openrouterClient(modelId) : ollama(modelId)
    ) as Parameters<typeof generateText>[0]["model"];

    if (provider === "openrouter" && !getOpenRouterApiKey()) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 400 });
    }

    const result = await generateText({
      model,
      system: buildCanvasGuideSystemPrompt(),
      prompt: buildCanvasGuideUserPrompt(payload),
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error("/api/canvas-agent error:", error);
    return NextResponse.json({ error: "Unable to reach the canvas guide right now." }, { status: 500 });
  }
}
