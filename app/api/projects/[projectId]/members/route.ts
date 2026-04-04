import {
  ProjectAccessError,
  removeProjectMemberForUser,
  upsertProjectMemberForUser,
} from "@/lib/project-collaboration";
import { requireLocalApiUser } from "@/lib/server/request-guards";

type RouteParams = {
  params: Promise<{
    projectId: string;
  }>;
};

type UpsertProjectMemberBody = {
  email?: unknown;
  role?: unknown;
};

type DeleteProjectMemberBody = {
  email?: unknown;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { projectId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as UpsertProjectMemberBody;
  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim().toLowerCase()
      : "";
  const role = body.role === "editor" || body.role === "viewer" ? body.role : null;

  if (!email || !role) {
    return new Response("Member email and role are required.", { status: 400 });
  }

  try {
    const project = await upsertProjectMemberForUser(projectId, { email, role }, guarded.user);
    return Response.json({ project });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return new Response(error.message, { status: error.status });
    }
    return new Response("Project not found", { status: 404 });
  }
}

export async function DELETE(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const { projectId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as DeleteProjectMemberBody;
  const email =
    typeof body.email === "string" && body.email.trim().length > 0
      ? body.email.trim().toLowerCase()
      : "";

  if (!email) {
    return new Response("Member email is required.", { status: 400 });
  }

  try {
    const project = await removeProjectMemberForUser(projectId, email, guarded.user);
    return Response.json({ project });
  } catch (error) {
    if (error instanceof ProjectAccessError) {
      return new Response(error.message, { status: error.status });
    }
    return new Response("Project not found", { status: 404 });
  }
}
