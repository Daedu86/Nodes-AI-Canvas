import { z } from "zod";
import { ProjectAccessError } from "@/lib/project-collaboration";
import {
  createProjectInvitationForUser,
  listProjectInvitationsForUser,
  ProjectInvitationError,
} from "@/lib/project-invitation-service";
import { getPublicAppOrigin } from "@/lib/server/public-app-origin";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const createSchema = z.object({
  email: z.string().trim().min(3).max(254),
  expiresAt: z.union([z.string(), z.number()]).optional(),
  role: z.enum(["editor", "viewer"]),
}).strict();

type RouteParams = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";

const invitationError = (error: unknown) => {
  if (error instanceof ProjectInvitationError) {
    return Response.json(
      { code: error.code, error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ProjectAccessError) {
    return Response.json(
      { code: "project_access_denied", error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { code: "project_not_found", error: "Project not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
};

export async function GET(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const { projectId } = await context.params;
  try {
    const invitations = await listProjectInvitationsForUser(projectId, guarded.user);
    return Response.json(
      { invitations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return invitationError(error);
  }
}

export async function POST(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_project_invitation", error: "Email and role are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { projectId } = await context.params;
  try {
    const result = await createProjectInvitationForUser({
      appOrigin: getPublicAppOrigin(req),
      email: parsed.data.email,
      expiresAt: parsed.data.expiresAt,
      projectId,
      role: parsed.data.role,
      user: guarded.user,
    });
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return invitationError(error);
  }
}
