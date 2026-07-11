import { randomUUID } from "node:crypto";
import { decode, encode } from "next-auth/jwt";
import { getAgentWorkRepository } from "@/lib/persistence/repositories";

const AGENT_TOKEN_SALT = "nodes-agent-token:v1";

type AgentTokenPayload = {
  agent?: boolean;
  label?: string | null;
  scope?: "api";
  sub?: string;
  tokenId?: string;
};

const resolveAgentTokenSecret = () => process.env.AGENT_TOKEN_SECRET?.trim() || "";

export function isAgentTokenConfigured() {
  return resolveAgentTokenSecret().length > 0;
}

export async function mintAgentToken(params: {
  label?: string | null;
  userId: string;
  maxAgeSeconds: number;
}): Promise<{ token: string; tokenId: string; label: string | null; expiresAt: string }> {
  const secret = resolveAgentTokenSecret();
  if (!secret) {
    throw new Error("Missing AGENT_TOKEN_SECRET");
  }

  const tokenId = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + params.maxAgeSeconds * 1000).toISOString();
  const label =
    typeof params.label === "string" && params.label.trim().length > 0
      ? params.label.trim().slice(0, 80)
      : null;

  const token = await encode({
    secret,
    salt: AGENT_TOKEN_SALT,
    maxAge: params.maxAgeSeconds,
    token: {
      agent: true,
      label,
      scope: "api",
      sub: params.userId,
      tokenId,
    } satisfies AgentTokenPayload,
  });

  return { token, tokenId, label, expiresAt };
}

export async function verifyAgentToken(
  token: string,
): Promise<{ userId: string; tokenId: string; label: string | null } | null> {
  const secret = resolveAgentTokenSecret();
  if (!secret) return null;

  let payload: AgentTokenPayload | null;
  try {
    payload = (await decode({
      token,
      secret,
      salt: AGENT_TOKEN_SALT,
    })) as AgentTokenPayload | null;
  } catch {
    return null;
  }

  if (!payload?.agent || payload.scope !== "api") return null;
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
    return null;
  }

  const tokenId =
    typeof payload.tokenId === "string" && payload.tokenId.trim().length > 0
      ? payload.tokenId.trim()
      : null;
  if (!tokenId) return null;

  try {
    const record = await getAgentWorkRepository().getAgentToken(payload.sub, tokenId);
    if (!record || record.revoked) return null;
    if (record.ownerId !== payload.sub || record.tokenId !== tokenId) return null;
    if (!record.expiresAt) return null;

    const expiresAt = new Date(record.expiresAt).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return null;

    const label =
      typeof record.label === "string" && record.label.trim().length > 0
        ? record.label.trim()
        : typeof payload.label === "string" && payload.label.trim().length > 0
          ? payload.label.trim()
          : null;

    return { userId: payload.sub, tokenId, label };
  } catch {
    return null;
  }
}
