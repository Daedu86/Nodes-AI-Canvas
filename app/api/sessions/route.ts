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
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const sessions = await listSessions({ includeArchived });
  return Response.json({ sessions });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateSessionBody;
  const session = await createSession({
    title: body.title ?? null,
    artifacts: normalizeSessionArtifactsDocument(body.artifacts),
    contextLinks: normalizeSessionContextLinksDocument(body.contextLinks),
    snapshot: body.snapshot ? normalizeSessionThreadExport(body.snapshot) : EMPTY_SESSION_THREAD_EXPORT,
  });
  return Response.json({ session }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as DeleteSessionsBody;
  const deleteAll = body.all === true;
  const requestedIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  const sessionIds = deleteAll
    ? (await listSessions({ includeArchived: true })).map((session) => session.id)
    : [...new Set(requestedIds)];

  if (sessionIds.length === 0) {
    return new Response("No sessions selected", { status: 400 });
  }

  await deleteSessionBatch(sessionIds);
  return Response.json({ deletedIds: sessionIds });
}
