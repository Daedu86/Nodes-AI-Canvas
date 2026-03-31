import {
  createProject,
  deleteProjects as deleteProjectBatch,
  listProjects,
} from "@/lib/project-store";

type CreateProjectBody = {
  memoryIds?: unknown;
  globalContext?: string;
  sessionIds?: unknown;
  title?: string | null;
};

type DeleteProjectsBody = {
  all?: boolean;
  projectIds?: unknown;
};

export const runtime = "nodejs";

export async function GET() {
  const projects = await listProjects();
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateProjectBody;
  const sessionIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const memoryIds = Array.isArray(body.memoryIds)
    ? body.memoryIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const project = await createProject({
    globalContext: typeof body.globalContext === "string" ? body.globalContext : "",
    memoryIds,
    sessionIds,
    title: body.title ?? null,
  });
  return Response.json({ project }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as DeleteProjectsBody;
  const deleteAll = body.all === true;
  const requestedIds = Array.isArray(body.projectIds)
    ? body.projectIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const projectIds = deleteAll
    ? (await listProjects()).map((project) => project.id)
    : [...new Set(requestedIds)];

  if (projectIds.length === 0) {
    return new Response("No projects selected", { status: 400 });
  }

  await deleteProjectBatch(projectIds);
  return Response.json({ deletedIds: projectIds });
}
