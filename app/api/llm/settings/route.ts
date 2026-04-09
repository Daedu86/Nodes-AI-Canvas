import { getLlmSettings, saveLlmSettings } from "@/lib/llm-settings-store";
import {
  maskLlmSettingsState,
  mergeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

type LlmSettingsResponse = {
  settings: LlmSettingsState | null;
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
  } satisfies LlmSettingsResponse);
}

export async function PUT(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as PutBody;
  const current = await getLlmSettings(guarded.user.id);
  const settings = await saveLlmSettings(
    guarded.user.id,
    mergeLlmSettingsState(current, body.settings),
  );
  return Response.json({
    settings: maskLlmSettingsState(settings),
  } satisfies LlmSettingsResponse);
}
