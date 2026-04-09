import { getLlmSettings, saveLlmSettings } from "@/lib/llm-settings-store";
import { normalizeLlmSettingsState, type LlmSettingsState } from "@/lib/llm/user-settings";
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
  return Response.json({ settings } satisfies LlmSettingsResponse);
}

export async function PUT(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as PutBody;
  const settings = await saveLlmSettings(
    guarded.user.id,
    normalizeLlmSettingsState(body.settings),
  );
  return Response.json({ settings } satisfies LlmSettingsResponse);
}
