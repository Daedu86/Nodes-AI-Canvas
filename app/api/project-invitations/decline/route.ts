import {
  declineProjectInvitationForUser,
  ProjectInvitationError,
} from "@/lib/project-invitation-service";
import { jsonNoStore, parseJsonBody } from "@/lib/server/api-response";
import {
  projectInvitationErrorResponse,
  projectInvitationTokenBodySchema,
} from "@/lib/server/project-invitation-http";
import { requireLocalApiUser } from "@/lib/server/request-guards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = await parseJsonBody(req, projectInvitationTokenBodySchema, {
    code: "invalid_invitation_token",
    error: "The invitation token is required.",
    status: 400,
  });
  if (!parsed.ok) return parsed.response;
  try {
    await declineProjectInvitationForUser(parsed.data.token, guarded.user);
    return jsonNoStore({ declined: true });
  } catch (error) {
    if (!(error instanceof ProjectInvitationError)) {
      console.error("Project invitation decline failed", error);
    }
    return projectInvitationErrorResponse(error, {
      code: "invitation_decline_failed",
      error: "Could not decline the invitation.",
      status: 500,
    });
  }
}
