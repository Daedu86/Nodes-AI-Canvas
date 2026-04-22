"use client";

import React from "react";
import { LifeBuoy, MessageSquareText, Plus } from "lucide-react";
import type { SupportTicket, SupportTicketKind } from "@/lib/support-ticket-documents";
import {
  SUPPORT_TICKET_MAX_BODY_CHARS,
  SUPPORT_TICKET_MAX_COMMENT_CHARS,
  SUPPORT_TICKET_MAX_PER_USER,
  SUPPORT_TICKET_MAX_TITLE_CHARS,
} from "@/lib/support-ticket-guardrails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CreateTicketDraft = {
  title: string;
  body: string;
  kind: SupportTicketKind;
};

const DEFAULT_DRAFT: CreateTicketDraft = {
  title: "",
  body: "",
  kind: "issue",
};

const ticketKindLabel: Record<SupportTicketKind, string> = {
  issue: "Issue",
  question: "Question",
  feature: "Feature request",
};

export function SupportWorkspace() {
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<CreateTicketDraft>(DEFAULT_DRAFT);
  const [replyDraft, setReplyDraft] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isReplying, setIsReplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusText, setStatusText] = React.useState<string | null>(null);

  const selectedTicket = React.useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets],
  );
  const isTicketLimitReached = tickets.length >= SUPPORT_TICKET_MAX_PER_USER;

  const loadTickets = React.useCallback(async () => {
    const response = await fetch("/api/support/tickets", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const payload = (await response.json()) as { tickets?: SupportTicket[] };
    const next = Array.isArray(payload.tickets) ? payload.tickets : [];
    setTickets(next);
    setSelectedTicketId((current) => {
      if (current && next.some((ticket) => ticket.id === current)) return current;
      return next[0]?.id ?? null;
    });
  }, []);

  React.useEffect(() => {
    void loadTickets().catch((fetchError) => {
      const message = fetchError instanceof Error ? fetchError.message : "Unable to load support tickets";
      setError(message);
    });
  }, [loadTickets]);

  const handleCreateTicket = React.useCallback(async () => {
    if (isTicketLimitReached) {
      setError(`Free-tier limit reached: max ${SUPPORT_TICKET_MAX_PER_USER} tickets per account.`);
      return;
    }
    if (!draft.title.trim() || !draft.body.trim()) {
      setError("Ticket title and description are required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatusText(null);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { ticket?: SupportTicket };
      if (payload.ticket) {
        setTickets((current) => [payload.ticket!, ...current]);
        setSelectedTicketId(payload.ticket.id);
      } else {
        await loadTickets();
      }
      setDraft(DEFAULT_DRAFT);
      setStatusText("Support ticket created and sent to admin.");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to create support ticket";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, isTicketLimitReached, loadTickets]);

  const handleReply = React.useCallback(async () => {
    if (!selectedTicket || !replyDraft.trim()) {
      setError("Write a reply before sending.");
      return;
    }
    setIsReplying(true);
    setError(null);
    setStatusText(null);
    try {
      const response = await fetch(`/api/support/tickets/${selectedTicket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { ticket?: SupportTicket };
      if (payload.ticket) {
        setTickets((current) =>
          current.map((entry) => (entry.id === payload.ticket!.id ? payload.ticket! : entry)),
        );
      } else {
        await loadTickets();
      }
      setReplyDraft("");
      setStatusText("Reply sent to support.");
    } catch (replyError) {
      const message = replyError instanceof Error ? replyError.message : "Unable to send reply";
      setError(message);
    } finally {
      setIsReplying(false);
    }
  }, [loadTickets, replyDraft, selectedTicket]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/70 px-6 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <LifeBuoy className="h-4 w-4" />
          Support tickets
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Open issues or questions about the product. Only your own tickets are visible in this workspace.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-card/50">
          <div className="border-b border-border/70 p-3 text-sm font-medium text-foreground">Create a ticket</div>
          <div className="space-y-3 p-3">
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value.slice(0, SUPPORT_TICKET_MAX_TITLE_CHARS),
                }))
              }
              placeholder="Ticket title"
              aria-label="Ticket title"
            />
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft((current) => ({ ...current, kind: event.target.value as SupportTicketKind }))
              }
              aria-label="Ticket type"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="issue">Issue</option>
              <option value="question">Question</option>
              <option value="feature">Feature request</option>
            </select>
            <textarea
              value={draft.body}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  body: event.target.value.slice(0, SUPPORT_TICKET_MAX_BODY_CHARS),
                }))
              }
              placeholder="Describe what happened or what you need help with"
              aria-label="Ticket description"
              rows={5}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Free-tier limits: max {SUPPORT_TICKET_MAX_PER_USER} tickets, no attachments.
            </p>
            <Button
              type="button"
              className="w-full justify-center"
              onClick={handleCreateTicket}
              disabled={isSubmitting || isTicketLimitReached}
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Creating..." : "Create ticket"}
            </Button>
          </div>

          <div className="border-t border-border/70 p-3 text-xs text-muted-foreground">
            Threads: {tickets.length}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70">
            {tickets.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <div className="divide-y divide-border/70">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full px-3 py-3 text-left transition hover:bg-muted/40 ${
                      selectedTicketId === ticket.id ? "bg-muted/45" : ""
                    }`}
                  >
                    <p className="line-clamp-1 text-sm font-medium text-foreground">{ticket.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticketKindLabel[ticket.kind]} · {ticket.status} · {new Date(ticket.updatedAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-card/50">
          {selectedTicket ? (
            <>
              <div className="border-b border-border/70 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{selectedTicket.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ticketKindLabel[selectedTicket.kind]} · {selectedTicket.status} · {new Date(selectedTicket.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <article className="rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{selectedTicket.body}</p>
                </article>

                {selectedTicket.comments.map((comment) => (
                  <article key={comment.id} className="rounded-lg border border-border/70 bg-background/70 p-3">
                    <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {comment.userName ?? comment.userEmail ?? "User"} · {new Date(comment.createdAt).toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>

              <div className="border-t border-border/70 p-3">
                <textarea
                  value={replyDraft}
                  onChange={(event) =>
                    setReplyDraft(event.target.value.slice(0, SUPPORT_TICKET_MAX_COMMENT_CHARS))
                  }
                  placeholder="Write a reply for this ticket thread"
                  aria-label="Reply to support ticket"
                  rows={3}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <Button type="button" onClick={handleReply} disabled={isReplying}>
                    <MessageSquareText className="h-4 w-4" />
                    {isReplying ? "Sending..." : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Select a ticket thread to view details.
            </div>
          )}
        </section>
      </div>

      {error ? (
        <div className="border-t border-rose-500/25 bg-rose-500/8 px-4 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
      {statusText ? (
        <div className="border-t border-emerald-500/25 bg-emerald-500/8 px-4 py-2 text-sm text-emerald-700">
          {statusText}
        </div>
      ) : null}
    </div>
  );
}
