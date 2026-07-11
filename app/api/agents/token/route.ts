import { requireLocalApiUser } from "@/lib/server/request-guards";
import { isAgentTokenConfigured, mintAgentToken } from "@/lib/server/agent-token";
import {
  countActiveAgentTokens,
  revokeAgentTokenRecord,
  upsertAgentTokenRecord,
} from "@/lib/server/agent-work";
import {
  DEFAULT_AGENT_TOKEN_LIFETIME_DAYS,
  MAX_AGENT_TOKEN_LIFETIME_DAYS,
} from "@/lib/agent-tokens";
import { getUserPlan } from "@/lib/user-plan-store";

export const runtime = "nodejs";

type PostBody = {
  expiresAt?: string | null;
  label?: string | null;
  ttlDays?: number;
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  if (guarded.user.isAgent) {
    return new Response(JSON.stringify({ error: "Agent tokens cannot manage other agent tokens." }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  if (!isAgentTokenConfigured()) {
    return new Response(JSON.stringify({ error: "Agent tokens require AGENT_TOKEN_SECRET." }), {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  const userPlan = await getUserPlan(guarded.user.id);
  if (userPlan === "free") {
    const activeTokenCount = await countActiveAgentTokens(guarded.user.id);
    if (activeTokenCount >= 1) {
      return new Response(
        JSON.stringify({
          error: "Free tier allows only one active agent.",
        }),
        {
          status: 400,
          headers: JSON_HEADERS,
        },
      );
    }
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const label = typeof body.label === "string" ? body.label : null;
  const now = Date.now();
  const requestedExpiresAt =
    typeof body.expiresAt === "string" && body.expiresAt.trim().length > 0
      ? new Date(body.expiresAt.trim())
      : null;

  let maxAgeSeconds: number;
  if (requestedExpiresAt) {
    if (Number.isNaN(requestedExpiresAt.getTime())) {
      return new Response(JSON.stringify({ error: "Pick a valid expiry date and time." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const maxExpiresAt = now + MAX_AGENT_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
    if (requestedExpiresAt.getTime() <= now) {
      return new Response(JSON.stringify({ error: "Expiry must be in the future." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    if (requestedExpiresAt.getTime() > maxExpiresAt) {
      return new Response(
        JSON.stringify({
          error: `Agent tokens can expire at most ${MAX_AGENT_TOKEN_LIFETIME_DAYS} days from now.`,
        }),
        {
          status: 400,
          headers: JSON_HEADERS,
        },
      );
    }
    maxAgeSeconds = Math.max(60, Math.ceil((requestedExpiresAt.getTime() - now) / 1000));
  } else {
    const ttlDaysRaw =
      typeof body.ttlDays === "number" ? body.ttlDays : DEFAULT_AGENT_TOKEN_LIFETIME_DAYS;
    const ttlDays = Number.isFinite(ttlDaysRaw)
      ? Math.max(1, Math.min(MAX_AGENT_TOKEN_LIFETIME_DAYS, Math.floor(ttlDaysRaw)))
      : DEFAULT_AGENT_TOKEN_LIFETIME_DAYS;
    maxAgeSeconds = ttlDays * 24 * 60 * 60;
  }

  const minted = await mintAgentToken({
    userId: guarded.user.id,
    maxAgeSeconds,
    label,
  });

  const saved = await upsertAgentTokenRecord({
    ownerId: guarded.user.id,
    tokenId: minted.tokenId,
    label: minted.label,
    expiresAt: minted.expiresAt,
  });
  if (!saved) {
    return new Response(
      JSON.stringify({
        error: "Agent token storage is unavailable. No token was issued.",
      }),
      {
        status: 503,
        headers: JSON_HEADERS,
      },
    );
  }

  return Response.json({
    saved: true,
    token: minted.token,
    tokenId: minted.tokenId,
    label: minted.label,
    expiresAt: minted.expiresAt,
  });
}

export async function DELETE(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  if (guarded.user.isAgent) {
    return new Response(JSON.stringify({ error: "Agent tokens cannot manage other agent tokens." }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  const url = new URL(req.url);
  const tokenId = url.searchParams.get("tokenId")?.trim();
  if (!tokenId) {
    return new Response(JSON.stringify({ error: "Missing tokenId." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  let revoked: Awaited<ReturnType<typeof revokeAgentTokenRecord>>;
  try {
    revoked = await revokeAgentTokenRecord({
      ownerId: guarded.user.id,
      tokenId,
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: "Agent token storage is unavailable right now. Try again after the workspace storage is ready.",
      }),
      {
        status: 503,
        headers: JSON_HEADERS,
      },
    );
  }

  if (!revoked) {
    return new Response(JSON.stringify({ error: "Agent token not found." }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  }

  return Response.json({
    revoked: true,
    tokenId,
  });
}
