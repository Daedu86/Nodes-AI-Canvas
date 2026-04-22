import { requireLocalApiUser } from "@/lib/server/request-guards";
import { notifyAdminOnTicketComment } from "@/lib/server/support-ticket-mail";
import { addSupportTicketCommentForUser } from "@/lib/support-ticket-store";
import {
  SUPPORT_TICKET_ATTACHMENT_MESSAGE,
  SUPPORT_TICKET_MAX_COMMENT_CHARS,
} from "@/lib/support-ticket-guardrails";

export const runtime = "nodejs";

type CreateCommentBody = {
  body?: unknown;
  attachments?: unknown;
};

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

export async function POST(req: Request, context: RouteContext) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const payload = (await req.json().catch(() => ({}))) as CreateCommentBody;
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    return new Response(SUPPORT_TICKET_ATTACHMENT_MESSAGE, { status: 400 });
  }
  const body =
    typeof payload.body === "string"
      ? payload.body.slice(0, SUPPORT_TICKET_MAX_COMMENT_CHARS)
      : "";
  const { ticketId } = await context.params;

  try {
    const result = await addSupportTicketCommentForUser({
      ticketId,
      ownerId: guarded.user.id,
      userId: guarded.user.id,
      userName: guarded.user.name,
      userEmail: guarded.user.email,
      body,
    });
    await notifyAdminOnTicketComment(result.ticket, result.comment);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add support comment";
    if (message === "Support ticket not found") {
      return new Response(message, { status: 404 });
    }
    return new Response(message, { status: 400 });
  }
}
