import { previewProjectInvitationToken } from "@/lib/project-invitation-service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const preview = await previewProjectInvitationToken(token);
  if (!preview) {
    return Response.json(
      { code: "invitation_not_found", error: "The invitation link is invalid." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { invitation: preview },
    { headers: { "Cache-Control": "no-store" } },
  );
}
