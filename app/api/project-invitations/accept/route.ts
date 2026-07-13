import { z } from "zod";
import {
  acceptProjectInvitationForUser,
  ProjectInvitationError,
} from "@/lib/project-invitation-service";
import { parseJsonBody } from "@/lib/server/api-response";
import { projectInvitationErrorResponse } from "@/lib/server/project-invitation-http";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const bodySchema = z.object({ token: z.string().min(1).max(128) }).strict();
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = await parseJsonBody(req, bodySchema, {
    code: "invalid_invitation_token",
    error: "The invitation token is required.",
    status: 400,
  });
  if (!parsed.ok) return parsed.response;
  try {
    const accepted = await acceptProjectInvitationForUser(parsed.data.token, guarded.user);
    return Response.json(
      { accepted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (!(error instanceof ProjectInvitationError)) {
      console.error("Project invitation acceptance failed", error);
    }
    return projectInvitationErrorResponse(error, {
      code: "invitation_acceptance_failed",
      error: "Could not accept the invitation.",
      status: 500,
    });
  }
}
