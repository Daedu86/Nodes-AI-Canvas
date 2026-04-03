import { deleteMemoryItem, getMemoryItem, patchMemoryItem } from "@/lib/memory-store";
import {
  PROJECT_MEMORY_TYPES,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";
import { getProject } from "@/lib/project-store";
import { getSession } from "@/lib/session-store";
import { requireLocalApiUser } from "@/lib/server/request-guards";

type RouteParams = {
  params: Promise<{
    memoryId: string;
  }>;
};

type PatchMemoryBody = {
  content?: string;
  sourceProjectId?: string | null;
  sourceKeys?: unknown;
  sourceKind?: string | null;
  sourceSessionId?: string | null;
  title?: string | null;
  type?: string;
};

export const runtime = "nodejs";

export async function GET(_: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(_);
  if ("response" in guarded) return guarded.response;

  const { memoryId } = await context.params;
  try {
    const item = await getMemoryItem(memoryId, guarded.user.id);
    return Response.json({ item });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { memoryId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchMemoryBody;
  try {
    let sourceProjectId: string | null | undefined;
    if (body.sourceProjectId === undefined) {
      sourceProjectId = undefined;
    } else if (typeof body.sourceProjectId === "string" && body.sourceProjectId.length > 0) {
      try {
        sourceProjectId = (await getProject(body.sourceProjectId, guarded.user.id)).id;
      } catch {
        sourceProjectId = null;
      }
    } else {
      sourceProjectId = null;
    }

    let sourceSessionId: string | null | undefined;
    if (body.sourceSessionId === undefined) {
      sourceSessionId = undefined;
    } else if (typeof body.sourceSessionId === "string" && body.sourceSessionId.length > 0) {
      try {
        sourceSessionId = (await getSession(body.sourceSessionId, guarded.user.id)).id;
      } catch {
        sourceSessionId = null;
      }
    } else {
      sourceSessionId = null;
    }

    const item = await patchMemoryItem(memoryId, {
      content:
        body.content === undefined
          ? undefined
          : typeof body.content === "string"
            ? body.content
            : "",
      sourceProjectId,
      sourceKeys:
        body.sourceKeys === undefined
          ? undefined
          : Array.isArray(body.sourceKeys)
            ? body.sourceKeys.filter((value): value is string => typeof value === "string" && value.length > 0)
            : [],
      sourceKind:
        body.sourceKind === undefined
          ? undefined
          : body.sourceKind === "session" || body.sourceKind === "branch"
            ? (body.sourceKind as ProjectMemorySourceKind)
            : null,
      sourceSessionId,
      title: body.title ?? undefined,
      type: PROJECT_MEMORY_TYPES.includes(body.type as ProjectMemoryType)
        ? (body.type as ProjectMemoryType)
        : undefined,
    }, guarded.user.id);
    return Response.json({ item });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}

export async function DELETE(_: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(_);
  if ("response" in guarded) return guarded.response;

  const { memoryId } = await context.params;
  try {
    await deleteMemoryItem(memoryId, guarded.user.id);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}
