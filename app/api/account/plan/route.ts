import { getLlmSettings } from "@/lib/llm-settings-store";
import { getPersistentChatUsageSnapshot } from "@/lib/chat-usage-store";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { isAdminUser } from "@/lib/server/admin-access";
import { getChatQuotaLimits, getOpenRouterCredentialPolicy } from "@/lib/user-plan";
import { getUserPlan } from "@/lib/user-plan-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const userPlan = await getUserPlan(guarded.user.id);
  const usage = await getPersistentChatUsageSnapshot(guarded.user.id);
  const settings = await getLlmSettings(guarded.user.id);

  return Response.json({
    isAdmin: isAdminUser(guarded.user),
    limits: getChatQuotaLimits(userPlan),
    plan: {
      current: userPlan,
    },
    providers: {
      ollama: {
        keyCount: settings?.providers.ollama.apiKeys?.length ?? 0,
      },
      openrouter: {
        ...getOpenRouterCredentialPolicy(userPlan),
        keyCount: settings?.providers.openrouter.apiKeys?.length ?? 0,
      },
    },
    usage,
  });
}
