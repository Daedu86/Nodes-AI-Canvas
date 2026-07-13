import { revokeProjectInvitationForUser } from "@/lib/project-invitation-service";
import { jsonNoStore } from "@/lib/server/api-response";
import {
  projectInvitationErrorResponse,
  projectNotFoundApiError,
} from "@/lib/server/project-invitation-http";
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
    return jsonNoStore({ project });
  } catch (error) {
    return projectInvitationErrorResponse(error, projectNotFoundApiError);
  }
}
