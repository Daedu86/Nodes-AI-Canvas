import { deleteMemoryItem, getMemoryItem, patchMemoryItem } from "@/lib/memory-store";
import {
  PROJECT_MEMORY_TYPES,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";

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
  const { memoryId } = await context.params;
  try {
    const item = await getMemoryItem(memoryId);
    return Response.json({ item });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const { memoryId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as PatchMemoryBody;
  try {
    const item = await patchMemoryItem(memoryId, {
      content:
        body.content === undefined
          ? undefined
          : typeof body.content === "string"
            ? body.content
            : "",
      sourceProjectId:
        body.sourceProjectId === undefined
          ? undefined
          : typeof body.sourceProjectId === "string" && body.sourceProjectId.length > 0
            ? body.sourceProjectId
            : null,
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
      sourceSessionId:
        body.sourceSessionId === undefined
          ? undefined
          : typeof body.sourceSessionId === "string" && body.sourceSessionId.length > 0
            ? body.sourceSessionId
            : null,
      title: body.title ?? undefined,
      type: PROJECT_MEMORY_TYPES.includes(body.type as ProjectMemoryType)
        ? (body.type as ProjectMemoryType)
        : undefined,
    });
    return Response.json({ item });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}

export async function DELETE(_: Request, context: RouteParams) {
  const { memoryId } = await context.params;
  try {
    await deleteMemoryItem(memoryId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Memory not found", { status: 404 });
  }
}
