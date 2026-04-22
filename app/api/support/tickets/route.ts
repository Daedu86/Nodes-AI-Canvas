import { requireLocalApiUser } from "@/lib/server/request-guards";
import { notifyAdminOnTicketCreated } from "@/lib/server/support-ticket-mail";
import {
  createSupportTicketForUser,
  listSupportTicketsForUser,
} from "@/lib/support-ticket-store";
import type { SupportTicketKind } from "@/lib/support-ticket-documents";
import {
  SUPPORT_TICKET_ATTACHMENT_MESSAGE,
  SUPPORT_TICKET_MAX_BODY_CHARS,
  SUPPORT_TICKET_MAX_PER_USER,
  SUPPORT_TICKET_MAX_TITLE_CHARS,
} from "@/lib/support-ticket-guardrails";

type CreateTicketBody = {
  title?: unknown;
  body?: unknown;
  kind?: unknown;
  attachments?: unknown;
};

const normalizeKind = (value: unknown): SupportTicketKind =>
  value === "feature" || value === "question" ? value : "issue";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const tickets = await listSupportTicketsForUser(guarded.user.id);
  return Response.json({ tickets });
}

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as CreateTicketBody;
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    return new Response(SUPPORT_TICKET_ATTACHMENT_MESSAGE, { status: 400 });
  }

  const existingTickets = await listSupportTicketsForUser(guarded.user.id);
  if (existingTickets.length >= SUPPORT_TICKET_MAX_PER_USER) {
    return new Response(
      `Free-tier limit reached: you can create up to ${SUPPORT_TICKET_MAX_PER_USER} support tickets.`,
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title.slice(0, SUPPORT_TICKET_MAX_TITLE_CHARS) : "";
  const description =
    typeof body.body === "string" ? body.body.slice(0, SUPPORT_TICKET_MAX_BODY_CHARS) : "";

  try {
    const ticket = await createSupportTicketForUser({
      ownerId: guarded.user.id,
      ownerName: guarded.user.name,
      ownerEmail: guarded.user.email,
      title,
      body: description,
      kind: normalizeKind(body.kind),
    });
    await notifyAdminOnTicketCreated(ticket);
    return Response.json({ ticket }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create support ticket";
    return new Response(message, { status: 400 });
  }
}
