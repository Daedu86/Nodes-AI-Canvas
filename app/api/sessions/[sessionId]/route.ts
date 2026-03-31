import { deleteSession, getSession, patchSession } from "@/lib/session-store";
import {
  normalizeSessionArtifactsDocument,
  normalizeSessionContextLinksDocument,
  normalizeSessionThreadExport,
} from "@/lib/session-documents";

export const runtime = "nodejs";

type PatchSessionBody = {
  archived?: boolean;
  artifacts?: unknown;
  contextLinks?: unknown;
  snapshot?: unknown;
  title?: string | null;
};

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_req: Request, context: RouteParams) {
  const { sessionId } = await context.params;
  try {
    const session = await getSession(sessionId);
    return Response.json({ session });
  } catch {
    return new Response("Session not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const { sessionId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchSessionBody;

  try {
    const session = await patchSession(sessionId, {
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      artifacts: body.artifacts === undefined ? undefined : normalizeSessionArtifactsDocument(body.artifacts),
      contextLinks:
        body.contextLinks === undefined
          ? undefined
          : normalizeSessionContextLinksDocument(body.contextLinks),
      title: body.title === undefined ? undefined : body.title,
      snapshot: body.snapshot === undefined ? undefined : normalizeSessionThreadExport(body.snapshot),
    });
    return Response.json({ session });
  } catch {
    return new Response("Session not found", { status: 404 });
  }
}

export async function DELETE(_req: Request, context: RouteParams) {
  const { sessionId } = await context.params;

  try {
    await deleteSession(sessionId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Session not found", { status: 404 });
  }
}
