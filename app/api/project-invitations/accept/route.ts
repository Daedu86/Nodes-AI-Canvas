import { z } from "zod";
import {
  acceptProjectInvitationForUser,
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
    const accepted = await acceptProjectInvitationForUser(parsed.data.token, guarded.user);
    return Response.json(
      { accepted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ProjectInvitationError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project invitation acceptance failed", error);
    return Response.json(
      { code: "invitation_acceptance_failed", error: "Could not accept the invitation." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
