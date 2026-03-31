import { getProject, patchProject } from "@/lib/project-store";

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
  const { projectId } = await context.params;
  try {
    const project = await getProject(projectId);
    return Response.json({ project });
  } catch {
    return new Response("Project not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const { projectId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchProjectBody;
  try {
    const project = await patchProject(projectId, {
      arenaWinnerSessionId:
        body.arenaWinnerSessionId === undefined
          ? undefined
          : typeof body.arenaWinnerSessionId === "string" && body.arenaWinnerSessionId.length > 0
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
        ? body.memoryIds.filter((value): value is string => typeof value === "string" && value.length > 0)
        : undefined,
      sessionIds: Array.isArray(body.sessionIds)
        ? body.sessionIds.filter((value): value is string => typeof value === "string" && value.length > 0)
        : undefined,
      title: body.title ?? undefined,
    });
    return Response.json({ project });
  } catch {
    return new Response("Project not found", { status: 404 });
  }
}
