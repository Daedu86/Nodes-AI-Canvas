import {
  createMemoryItem,
  deleteMemoryItems,
  listMemoryItems,
} from "@/lib/memory-store";
import {
  PROJECT_MEMORY_TYPES,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";

type CreateMemoryBody = {
  content?: string;
  sourceProjectId?: string | null;
  sourceKeys?: unknown;
  sourceKind?: string | null;
  sourceSessionId?: string | null;
  title?: string | null;
  type?: string;
};

type DeleteMemoryBody = {
  all?: boolean;
  memoryIds?: unknown;
};

export const runtime = "nodejs";

export async function GET() {
  const items = await listMemoryItems();
  return Response.json({ items });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateMemoryBody;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const type = PROJECT_MEMORY_TYPES.includes(body.type as ProjectMemoryType)
    ? (body.type as ProjectMemoryType)
    : "summary";

  if (!title || !content.trim()) {
    return new Response("Title and content are required", { status: 400 });
  }

  const item = await createMemoryItem({
    content,
    sourceProjectId:
      typeof body.sourceProjectId === "string" && body.sourceProjectId.length > 0
        ? body.sourceProjectId
        : null,
    sourceKeys: Array.isArray(body.sourceKeys)
      ? body.sourceKeys.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [],
    sourceKind:
      body.sourceKind === "session" || body.sourceKind === "branch"
        ? (body.sourceKind as ProjectMemorySourceKind)
        : null,
    sourceSessionId:
      typeof body.sourceSessionId === "string" && body.sourceSessionId.length > 0
        ? body.sourceSessionId
        : null,
    title,
    type,
  });
  return Response.json({ item }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as DeleteMemoryBody;
  const deleteAll = body.all === true;
  const requestedIds = Array.isArray(body.memoryIds)
    ? body.memoryIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const memoryIds = deleteAll
    ? (await listMemoryItems()).map((item) => item.id)
    : [...new Set(requestedIds)];

  if (memoryIds.length === 0) {
    return new Response("No memory selected", { status: 400 });
  }

  await deleteMemoryItems(memoryIds);
  return Response.json({ deletedIds: memoryIds });
}
