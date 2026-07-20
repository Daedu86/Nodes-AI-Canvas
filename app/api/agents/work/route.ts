import { listProjectsForUser } from "@/lib/project-collaboration";
import { listSessions } from "@/lib/session-store";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { getAgentWorkRepository } from "@/lib/persistence/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODEX_RUNTIME_AGENT_ID = "codex-runtime";
const CODEX_MODEL = process.env.CODEX_MODEL?.trim() || "gpt-5.6-sol";

const getCodexConnectionState = async () => {
  const rawUrl = process.env.CODEX_RUNNER_URL?.trim();
  if (!rawUrl) return false;

  try {
    const baseUrl = new URL(rawUrl).toString().replace(/\/+$/, "");
    const headers = new Headers();
    const token = process.env.CODEX_RUNNER_TOKEN?.trim();
    if (token) headers.set("authorization", `Bearer ${token}`);

    const response = await fetch(`${baseUrl}/readyz`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return false;

    const body = (await response.json().catch(() => null)) as
      | { ok?: unknown; codexRunning?: unknown; authenticated?: unknown }
      | null;
    return Boolean(body?.ok && body?.codexRunning && body?.authenticated);
  } catch {
    return false;
  }
};

type AgentWorkResponse = {
  agents: Array<{
    tokenId: string;
    label: string | null;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    eventCount: number;
    sessionIds: string[];
    projectIds: string[];
  }>;
  sessions: Array<{
    id: string;
    title: string | null;
    updatedAt: string;
    createdAt: string;
    archived: boolean;
    messageCount: number;
  }>;
  projects: Array<{
    id: string;
    title: string | null;
    updatedAt: string;
    createdAt: string;
    sessionCount: number;
  }>;
  events: Array<{
    id: string;
    tokenId: string | null;
    eventType: string;
    method: string;
    route: string;
    sessionId: string | null;
    projectId: string | null;
    createdAt: string;
  }>;
};

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const url = new URL(req.url);
  const tokenId = url.searchParams.get("tokenId");
  const tokenFilter = tokenId && tokenId.length > 0 ? tokenId : null;
  const codexOnly = tokenFilter === CODEX_RUNTIME_AGENT_ID;

  const repo = getAgentWorkRepository();
  let tokens = [];
  let events = [];
  try {
    [tokens, events] = await Promise.all([
      repo.listAgentTokens(guarded.user.id),
      repo.listAgentEvents(guarded.user.id, {
        limit: 250,
        tokenId: codexOnly ? null : tokenFilter,
        eventTypePrefix: codexOnly ? "codex." : null,
      }),
    ]);
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "Agent Work storage is not available yet. Apply the Supabase migration 20260414190000_add_agent_work.sql and redeploy.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const [sessions, projects, codexConnected] = await Promise.all([
    listSessions({ includeArchived: true, ownerId: guarded.user.id }),
    listProjectsForUser(guarded.user),
    getCodexConnectionState(),
  ]);

  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const sessionIds = new Set<string>();
  const projectIds = new Set<string>();
  events.forEach((event) => {
    if (event.sessionId) sessionIds.add(event.sessionId);
    if (event.projectId) projectIds.add(event.projectId);
  });

  const agents = tokens
    .map((token) => {
      if (token.revoked) return null;
      const tokenEvents = events.filter((event) => event.tokenId === token.tokenId);
      const tokenSessionIds = [
        ...new Set(tokenEvents.flatMap((event) => (event.sessionId ? [event.sessionId] : []))),
      ];
      const tokenProjectIds = [
        ...new Set(tokenEvents.flatMap((event) => (event.projectId ? [event.projectId] : []))),
      ];
      return {
        tokenId: token.tokenId,
        label: token.label,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        lastUsedAt: token.lastUsedAt,
        eventCount: tokenEvents.length,
        sessionIds: tokenSessionIds,
        projectIds: tokenProjectIds,
      };
    })
    .filter(Boolean) as AgentWorkResponse["agents"];

  const codexEvents = events.filter((event) => event.eventType.startsWith("codex."));
  if (codexEvents.length > 0 || codexConnected) {
    const chronological = [...codexEvents].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const codexSessionIds = [
      ...new Set(codexEvents.flatMap((event) => (event.sessionId ? [event.sessionId] : []))),
    ];
    const codexProjectIds = [
      ...new Set(codexEvents.flatMap((event) => (event.projectId ? [event.projectId] : []))),
    ];
    agents.unshift({
      tokenId: CODEX_RUNTIME_AGENT_ID,
      label: `Codex · ${codexConnected ? "Connected" : "Offline"} · ${CODEX_MODEL}`,
      createdAt: chronological[0]?.createdAt ?? new Date().toISOString(),
      expiresAt: null,
      lastUsedAt: chronological.at(-1)?.createdAt ?? null,
      eventCount: codexEvents.length,
      sessionIds: codexSessionIds,
      projectIds: codexProjectIds,
    });
  }

  const response: AgentWorkResponse = {
    agents,
    sessions: [...sessionIds]
      .map((id) => sessionsById.get(id))
      .filter(Boolean) as AgentWorkResponse["sessions"],
    projects: [...projectIds]
      .map((id) => projectsById.get(id))
      .filter(Boolean) as AgentWorkResponse["projects"],
    events: events.map((event) => ({
      id: event.id,
      tokenId: event.tokenId,
      eventType: event.eventType,
      method: event.method,
      route: event.route,
      sessionId: event.sessionId,
      projectId: event.projectId,
      createdAt: event.createdAt,
    })),
  };

  return Response.json(response);
}
