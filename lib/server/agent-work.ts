import { getAgentWorkRepository } from "@/lib/persistence/repositories";

export type AgentActorInfo = {
  tokenId: string | null;
  label: string | null;
  ownerId: string;
};

export async function upsertAgentTokenRecord(params: {
  ownerId: string;
  tokenId: string;
  label: string | null;
  expiresAt: string | null;
}) {
  const repo = getAgentWorkRepository();
  try {
    await repo.upsertAgentToken({
      tokenId: params.tokenId,
      ownerId: params.ownerId,
      label: params.label,
      expiresAt: params.expiresAt,
    });
    return true;
  } catch (error) {
    // Don't break token minting if the schema isn't installed yet.
    console.warn("[agent-work] failed to upsert agent token record", error);
    return false;
  }
}

export async function revokeAgentTokenRecord(params: {
  ownerId: string;
  tokenId: string;
}) {
  const repo = getAgentWorkRepository();
  return repo.revokeAgentToken(params.ownerId, params.tokenId);
}

export async function countActiveAgentTokens(ownerId: string) {
  const repo = getAgentWorkRepository();
  const tokens = await repo.listAgentTokens(ownerId);
  const now = Date.now();
  return tokens.filter((token) => {
    if (token.revoked) return false;
    if (!token.expiresAt) return true;
    const expiresAt = new Date(token.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt > now;
  }).length;
}

export async function recordAgentEvent(params: {
  actor: AgentActorInfo;
  eventType: string;
  method: string;
  route: string;
  sessionId?: string | null;
  projectId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const repo = getAgentWorkRepository();
  try {
    if (params.actor.tokenId) {
      await repo.markAgentTokenUsed(params.actor.ownerId, params.actor.tokenId);
    }

    await repo.recordAgentEvent(params.actor.ownerId, {
      tokenId: params.actor.tokenId ?? null,
      eventType: params.eventType,
      method: params.method,
      route: params.route,
      sessionId: params.sessionId ?? null,
      projectId: params.projectId ?? null,
      payload: params.payload ?? {},
      ownerId: params.actor.ownerId,
    });
  } catch (error) {
    console.warn("[agent-work] failed to record agent event", error);
  }
}
