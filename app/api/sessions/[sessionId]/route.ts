import { deleteSession, getSession, patchSession } from "@/lib/session-store";
import {
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
} from "@/lib/session-documents";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import {
  isSessionVersionConflictError,
  isValidSessionVersion,
  SESSION_VERSION_CONFLICT_CODE,
} from "@/lib/session-version-conflict";

export const runtime = "nodejs";

type PatchSessionBody = {
  archived?: boolean;
  artifacts?: unknown;
  contextLinks?: unknown;
  expectedVersion?: unknown;
  snapshot?: unknown;
  title?: string | null;
};

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(_req);
  if ("response" in guarded) return guarded.response;

  const { sessionId } = await context.params;
  try {
    const session = await getSession(sessionId, guarded.user.id);
    return Response.json({ session });
  } catch {
    return new Response("Session not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { sessionId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchSessionBody;
  if (!isValidSessionVersion(body.expectedVersion)) {
    return Response.json(
      {
        code: "session_version_required",
        error: "A positive expectedVersion is required to update a session.",
      },
      { status: 428 },
    );
  }

  try {
    const session = await patchSession(
      sessionId,
      {
        archived: typeof body.archived === "boolean" ? body.archived : undefined,
        artifacts:
          body.artifacts === undefined
            ? undefined
            : normalizeSessionArtifactsDocument(body.artifacts),
        contextLinks:
          body.contextLinks === undefined
            ? undefined
            : normalizeSessionContextLinksDocument(body.contextLinks),
        title: body.title === undefined ? undefined : body.title,
        snapshot:
          body.snapshot === undefined
            ? undefined
            : normalizeSessionThreadExport(body.snapshot),
      },
      {
        expectedVersion: body.expectedVersion,
        ownerId: guarded.user.id,
      },
    );
    return Response.json({ session });
  } catch (error) {
    if (isSessionVersionConflictError(error)) {
      return Response.json(
        {
          code: SESSION_VERSION_CONFLICT_CODE,
          error: "The session changed after it was loaded.",
          expectedVersion: error.expectedVersion,
          session: error.currentSession,
        },
        { status: 409 },
      );
    }
    return new Response("Session not found", { status: 404 });
  }
}

export async function DELETE(_req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(_req);
  if ("response" in guarded) return guarded.response;

  const { sessionId } = await context.params;

  try {
    await deleteSession(sessionId, guarded.user.id);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Session not found", { status: 404 });
  }
}
