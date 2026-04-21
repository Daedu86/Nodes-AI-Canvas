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

const resolveAuthSecret = () =>
  process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";

export function isAgentTokenConfigured() {
  return resolveAuthSecret().length > 0;
}

export async function mintAgentToken(params: {
  label?: string | null;
  userId: string;
  maxAgeSeconds: number;
}): Promise<{ token: string; tokenId: string; label: string | null; expiresAt: string }> {
  const secret = resolveAuthSecret();
  if (!secret) {
    throw new Error("Missing AUTH_SECRET/NEXTAUTH_SECRET");
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

export async function verifyAgentToken(token: string): Promise<{ userId: string; tokenId: string | null; label: string | null } | null> {
  const secret = resolveAuthSecret();
  if (!secret) return null;

  const payload = (await decode({
    token,
    secret,
    salt: AGENT_TOKEN_SALT,
  })) as AgentTokenPayload | null;

  if (!payload?.agent || payload.scope !== "api") return null;
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
    return null;
  }

  const tokenId = typeof payload.tokenId === "string" && payload.tokenId.trim().length > 0
    ? payload.tokenId.trim()
    : null;
  const label = typeof payload.label === "string" && payload.label.trim().length > 0
    ? payload.label.trim()
    : null;

  if (tokenId) {
    try {
      const record = await getAgentWorkRepository().getAgentToken(payload.sub, tokenId);
      if (!record || record.revoked) {
        return null;
      }
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
        return null;
      }
    } catch {
      // If token state storage is temporarily unavailable, fall back to the signed token itself.
    }
  }

  return { userId: payload.sub, tokenId, label };
}
