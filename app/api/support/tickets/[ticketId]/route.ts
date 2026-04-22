import { requireLocalApiUser } from "@/lib/server/request-guards";
import { getSupportTicketForUser } from "@/lib/support-ticket-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  try {
    const { ticketId } = await context.params;
    const ticket = await getSupportTicketForUser(ticketId, guarded.user.id);
    return Response.json({ ticket });
  } catch {
    return new Response("Support ticket not found", { status: 404 });
  }
}
