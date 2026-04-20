import { getLlmSettings, saveLlmSettings } from "@/lib/llm-settings-store";
import {
  DEFAULT_LLM_SETTINGS_STATE,
  maskLlmSettingsState,
  mergeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import { getOpenRouterCredentialPolicy } from "@/lib/user-plan";
import { getUserPlan } from "@/lib/user-plan-store";
import { validateOllamaBaseUrl } from "@/lib/server/ollama-base-url";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

type LlmSettingsResponse = {
  plan: {
    current: "free" | "paid";
  };
  settings: LlmSettingsState | null;
  policy: {
    openrouter: {
      hasDeploymentKey: boolean;
      requireUserKey: boolean;
    };
  };
};

type PutBody = {
  settings?: Partial<LlmSettingsState> | null;
};

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const settings = await getLlmSettings(guarded.user.id);
  const userPlan = await getUserPlan(guarded.user.id);
  return Response.json({
    plan: {
      current: userPlan,
    },
    settings: maskLlmSettingsState(settings),
    policy: {
      openrouter: getOpenRouterCredentialPolicy(userPlan),
    },
  } satisfies LlmSettingsResponse);
}

export async function PUT(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as PutBody;
  const current = await getLlmSettings(guarded.user.id);
  const userPlan = await getUserPlan(guarded.user.id);
  const merged = mergeLlmSettingsState(current, body.settings);

  const ollamaValidation = validateOllamaBaseUrl(merged.providers.ollama.baseUrl);
  if (!ollamaValidation.ok) {
    // Keep settings writable even if an older/disallowed Ollama URL was stored previously.
    // This prevents unrelated changes (e.g. OpenRouter model updates) from being blocked.
    merged.providers.ollama.baseUrl = DEFAULT_LLM_SETTINGS_STATE.providers.ollama.baseUrl;
  }

  const settings = await saveLlmSettings(guarded.user.id, merged);
  return Response.json({
    plan: {
      current: userPlan,
    },
    settings: maskLlmSettingsState(settings),
    policy: {
      openrouter: getOpenRouterCredentialPolicy(userPlan),
    },
  } satisfies LlmSettingsResponse);
}
