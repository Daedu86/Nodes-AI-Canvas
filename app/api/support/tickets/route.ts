import { requireLocalApiUser } from "@/lib/server/request-guards";
import { notifyAdminOnTicketCreated } from "@/lib/server/support-ticket-mail";
import {
  createSupportTicketForUser,
  listSupportTicketsForUser,
} from "@/lib/support-ticket-store";
import type { SupportTicketKind } from "@/lib/support-ticket-documents";

type CreateTicketBody = {
  title?: unknown;
  body?: unknown;
  kind?: unknown;
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
  const title = typeof body.title === "string" ? body.title : "";
  const description = typeof body.body === "string" ? body.body : "";

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

