import { NextResponse } from "next/server";
import { generateText } from "ai";
import {
  buildCanvasGuideSystemPrompt,
  buildCanvasGuideUserPrompt,
  getCanvasGuideActionLabel,
  type CanvasGuideAction,
  type CanvasGuidePayload,
} from "@/lib/canvas-agent/canvas-agent-context";
import {
  resolveModelConfig,
  type Provider,
} from "@/lib/llm/config";
import { isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import {
  createLanguageModel,
  getMissingProviderCredential,
  getUserModelOverrides,
} from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { getUserPlan } from "@/lib/user-plan-store";

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
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const requestOverrides = await getUserModelOverrides(guarded.user.id);
    const userPlan = await getUserPlan(guarded.user.id);
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
    const quota = await reserveChatQuota(guarded.user.id, userPlan);
    if (!quota.ok) {
      return NextResponse.json({ error: quota.rejection.message }, { status: quota.rejection.status });
    }

    const missingCredential = getMissingProviderCredential(provider, requestOverrides, { userPlan });
    if (missingCredential) {
      quota.grant.release();
      return NextResponse.json({ error: missingCredential.message }, { status: missingCredential.status });
    }

    try {
      const model = createLanguageModel(
        { modelId, provider },
        requestOverrides,
        { userPlan },
      ) as Parameters<typeof generateText>[0]["model"];
      const result = await generateText({
        model,
        system: buildCanvasGuideSystemPrompt(),
        prompt: buildCanvasGuideUserPrompt(payload),
      });

      return NextResponse.json({ text: result.text });
    } finally {
      quota.grant.release();
    }
  } catch (error) {
    console.error("/api/canvas-agent error:", error);
    return NextResponse.json({ error: "Unable to reach the canvas guide right now." }, { status: 500 });
  }
}
