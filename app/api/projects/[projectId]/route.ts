import { getProject, patchProject } from "@/lib/project-store";
import { listMemoryItems } from "@/lib/memory-store";
import { listSessions } from "@/lib/session-store";
import { requireLocalApiUser } from "@/lib/server/request-guards";

type RouteParams = {
  params: Promise<{
    projectId: string;
  }>;
};

type PatchProjectBody = {
  arenaWinnerBranchKey?: string | null;
  arenaWinnerSessionId?: string | null;
  globalContext?: string;
  memoryIds?: unknown;
  sessionIds?: unknown;
  title?: string | null;
};

export const runtime = "nodejs";

export async function GET(_: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(_);
  if ("response" in guarded) return guarded.response;

  const { projectId } = await context.params;
  try {
    const project = await getProject(projectId, guarded.user.id);
    return Response.json({ project });
  } catch {
    return new Response("Project not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { projectId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchProjectBody;
  try {
    const [sessions, memoryItems] = await Promise.all([
      listSessions({ includeArchived: true, ownerId: guarded.user.id }),
      listMemoryItems({ ownerId: guarded.user.id }),
    ]);
    const allowedSessionIds = new Set(sessions.map((session) => session.id));
    const allowedMemoryIds = new Set(memoryItems.map((item) => item.id));
    const project = await patchProject(projectId, {
      arenaWinnerSessionId:
        body.arenaWinnerSessionId === undefined
          ? undefined
          : typeof body.arenaWinnerSessionId === "string" && body.arenaWinnerSessionId.length > 0
            && allowedSessionIds.has(body.arenaWinnerSessionId)
            ? body.arenaWinnerSessionId
            : null,
      arenaWinnerBranchKey:
        body.arenaWinnerBranchKey === undefined
          ? undefined
          : typeof body.arenaWinnerBranchKey === "string" && body.arenaWinnerBranchKey.length > 0
            ? body.arenaWinnerBranchKey
            : null,
      globalContext:
        body.globalContext === undefined
          ? undefined
          : typeof body.globalContext === "string"
            ? body.globalContext
            : "",
      memoryIds: Array.isArray(body.memoryIds)
        ? body.memoryIds
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .filter((value) => allowedMemoryIds.has(value))
        : undefined,
      sessionIds: Array.isArray(body.sessionIds)
        ? body.sessionIds
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .filter((value) => allowedSessionIds.has(value))
        : undefined,
      title: body.title ?? undefined,
    }, guarded.user.id);
    return Response.json({ project });
  } catch {
    return new Response("Project not found", { status: 404 });
  }
}
