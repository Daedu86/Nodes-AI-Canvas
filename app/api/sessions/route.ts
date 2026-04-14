import {
  createSession,
  deleteSessions as deleteSessionBatch,
  listSessions,
} from "@/lib/session-store";
import {
  EMPTY_SESSION_THREAD_EXPORT,
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
} from "@/lib/session-documents";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { recordAgentEvent } from "@/lib/server/agent-work";

export const runtime = "nodejs";

type CreateSessionBody = {
  artifacts?: unknown;
  contextLinks?: unknown;
  snapshot?: unknown;
  title?: string | null;
};

type DeleteSessionsBody = {
  all?: boolean;
  sessionIds?: unknown;
};

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const sessions = await listSessions({ includeArchived, ownerId: guarded.user.id });
  return Response.json({ sessions });
}

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as CreateSessionBody;
  const session = await createSession({
    ownerId: guarded.user.id,
    title: body.title ?? null,
    artifacts: normalizeSessionArtifactsDocument(body.artifacts),
    contextLinks: normalizeSessionContextLinksDocument(body.contextLinks),
    snapshot: body.snapshot ? normalizeSessionThreadExport(body.snapshot) : EMPTY_SESSION_THREAD_EXPORT,
  });

  if (guarded.user.isAgent) {
    await recordAgentEvent({
      actor: {
        ownerId: guarded.user.id,
        tokenId: guarded.user.agentTokenId ?? null,
        label: guarded.user.agentLabel ?? null,
      },
      eventType: "session.created",
      method: "POST",
      route: "/api/sessions",
      sessionId: session.id,
    });
  }
  return Response.json({ session }, { status: 201 });
}

export async function DELETE(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as DeleteSessionsBody;
  const deleteAll = body.all === true;
  const requestedIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  const sessionIds = deleteAll
    ? (await listSessions({ includeArchived: true, ownerId: guarded.user.id })).map((session) => session.id)
    : [...new Set(requestedIds)];

  if (sessionIds.length === 0) {
    return new Response("No sessions selected", { status: 400 });
  }

  await deleteSessionBatch(sessionIds, guarded.user.id);
  return Response.json({ deletedIds: sessionIds });
}
