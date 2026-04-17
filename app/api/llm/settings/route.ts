import { getLlmSettings, saveLlmSettings } from "@/lib/llm-settings-store";
import {
  maskLlmSettingsState,
  mergeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import { validateOllamaBaseUrl } from "@/lib/server/ollama-base-url";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

const isOpenRouterDeploymentKeyAllowed = () =>
  process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY === "1";

const isOpenRouterUserKeyRequired = () =>
  process.env.OPENROUTER_REQUIRE_USER_KEY === "1" || !isOpenRouterDeploymentKeyAllowed();

type LlmSettingsResponse = {
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
  return Response.json({
    settings: maskLlmSettingsState(settings),
    policy: {
      openrouter: {
        hasDeploymentKey:
          isOpenRouterDeploymentKeyAllowed() && Boolean(process.env.OPENROUTER_API_KEY?.trim()),
        requireUserKey: isOpenRouterUserKeyRequired(),
      },
    },
  } satisfies LlmSettingsResponse);
}

export async function PUT(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as PutBody;
  const current = await getLlmSettings(guarded.user.id);
  const merged = mergeLlmSettingsState(current, body.settings);

  const ollamaValidation = validateOllamaBaseUrl(merged.providers.ollama.baseUrl);
  if (!ollamaValidation.ok) {
    return new Response(JSON.stringify({ error: ollamaValidation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const settings = await saveLlmSettings(guarded.user.id, merged);
  return Response.json({
    settings: maskLlmSettingsState(settings),
    policy: {
      openrouter: {
        hasDeploymentKey:
          isOpenRouterDeploymentKeyAllowed() && Boolean(process.env.OPENROUTER_API_KEY?.trim()),
        requireUserKey: isOpenRouterUserKeyRequired(),
      },
    },
  } satisfies LlmSettingsResponse);
}
