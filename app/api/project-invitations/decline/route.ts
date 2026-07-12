import { z } from "zod";
import {
  declineProjectInvitationForUser,
  ProjectInvitationError,
} from "@/lib/project-invitation-service";
import { requireLocalApiUser } from "@/lib/server/request-guards";

const bodySchema = z.object({ token: z.string().min(1).max(128) }).strict();
export const runtime = "nodejs";

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_invitation_token", error: "The invitation token is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await declineProjectInvitationForUser(parsed.data.token, guarded.user);
    return Response.json(
      { declined: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ProjectInvitationError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project invitation decline failed", error);
    return Response.json(
      { code: "invitation_decline_failed", error: "Could not decline the invitation." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
