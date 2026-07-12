import { ProjectAccessError } from "@/lib/project-collaboration";
import {
  ProjectInvitationError,
  revokeProjectInvitationForUser,
} from "@/lib/project-invitation-service";
import { requireLocalApiUser } from "@/lib/server/request-guards";

type RouteParams = {
  params: Promise<{ invitationId: string; projectId: string }>;
};

export const runtime = "nodejs";

export async function DELETE(req: Request, context: RouteParams) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const { invitationId, projectId } = await context.params;
  try {
    const project = await revokeProjectInvitationForUser({
      invitationId,
      projectId,
      user: guarded.user,
    });
    return Response.json(
      { project },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
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
  }
}
