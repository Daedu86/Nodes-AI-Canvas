import { decode, encode } from "next-auth/jwt";

const AGENT_TOKEN_SALT = "nodes-agent-token:v1";

type AgentTokenPayload = {
  agent?: boolean;
  scope?: "api";
  sub?: string;
};

const resolveAuthSecret = () =>
  process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";

export function isAgentTokenConfigured() {
  return resolveAuthSecret().length > 0;
}

export async function mintAgentToken(params: {
  userId: string;
  maxAgeSeconds: number;
}): Promise<{ token: string; expiresAt: string }> {
  const secret = resolveAuthSecret();
  if (!secret) {
    throw new Error("Missing AUTH_SECRET/NEXTAUTH_SECRET");
  }

  const now = Date.now();
  const expiresAt = new Date(now + params.maxAgeSeconds * 1000).toISOString();

  const token = await encode({
    secret,
    salt: AGENT_TOKEN_SALT,
    maxAge: params.maxAgeSeconds,
    token: {
      agent: true,
      scope: "api",
      sub: params.userId,
    } satisfies AgentTokenPayload,
  });

  return { token, expiresAt };
}

export async function verifyAgentToken(token: string): Promise<{ userId: string } | null> {
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

  return { userId: payload.sub };
}

