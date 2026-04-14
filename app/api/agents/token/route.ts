import { requireLocalApiUser } from "@/lib/server/request-guards";
import { isAgentTokenConfigured, mintAgentToken } from "@/lib/server/agent-token";
import { upsertAgentTokenRecord } from "@/lib/server/agent-work";

export const runtime = "nodejs";

type PostBody = {
  label?: string | null;
  ttlDays?: number;
};

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  if (!isAgentTokenConfigured()) {
    return new Response(JSON.stringify({ error: "Agent tokens require AUTH_SECRET." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const label = typeof body.label === "string" ? body.label : null;
  const ttlDaysRaw = typeof body.ttlDays === "number" ? body.ttlDays : 30;
  const ttlDays = Number.isFinite(ttlDaysRaw) ? Math.max(1, Math.min(90, Math.floor(ttlDaysRaw))) : 30;
  const maxAgeSeconds = ttlDays * 24 * 60 * 60;

  const minted = await mintAgentToken({
    userId: guarded.user.id,
    maxAgeSeconds,
    label,
  });

  await upsertAgentTokenRecord({
    ownerId: guarded.user.id,
    tokenId: minted.tokenId,
    label: minted.label,
    expiresAt: minted.expiresAt,
  });

  return Response.json({
    token: minted.token,
    tokenId: minted.tokenId,
    label: minted.label,
    expiresAt: minted.expiresAt,
    ttlDays,
  });
}
