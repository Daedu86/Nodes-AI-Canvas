import type { SupportTicket, SupportTicketComment } from "@/lib/support-ticket-documents";

const parseCsv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const getAdminRecipients = () => parseCsv(process.env.SUPPORT_ADMIN_EMAILS);


async function sendMail(input: { subject: string; text: string }) {
  const recipients = getAdminRecipients();
  if (recipients.length === 0) return;
  console.info("[support-ticket-mail] email notification skipped because nodemailer is not installed", {
    recipients: recipients.length,
    subject: input.subject,
  });
}

export async function notifyAdminOnTicketCreated(ticket: SupportTicket) {
  try {
    await sendMail({
      subject: `[Support] New ${ticket.kind} ticket: ${ticket.title}`,
      text: [
        "A new support ticket was created.",
        "",
        `Ticket ID: ${ticket.id}`,
        `Kind: ${ticket.kind}`,
        `Status: ${ticket.status}`,
        `Created: ${ticket.createdAt}`,
        `User ID: ${ticket.ownerId}`,
        `User Name: ${ticket.ownerName ?? "-"}`,
        `User Email: ${ticket.ownerEmail ?? "-"}`,
        "",
        "Description:",
        ticket.body,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[support-ticket-mail] create notification failed", error);
  }
}

export async function notifyAdminOnTicketComment(
  ticket: SupportTicket,
  comment: SupportTicketComment,
) {
  try {
    await sendMail({
      subject: `[Support] Ticket reply: ${ticket.title}`,
      text: [
        "A new support ticket comment was added.",
        "",
        `Ticket ID: ${ticket.id}`,
        `Ticket Kind: ${ticket.kind}`,
        `Ticket Status: ${ticket.status}`,
        `Updated: ${ticket.updatedAt}`,
        `Ticket Owner ID: ${ticket.ownerId}`,
        `Ticket Owner Name: ${ticket.ownerName ?? "-"}`,
        `Ticket Owner Email: ${ticket.ownerEmail ?? "-"}`,
        "",
        `Comment ID: ${comment.id}`,
        `Comment Created: ${comment.createdAt}`,
        `Comment User ID: ${comment.userId}`,
        `Comment User Name: ${comment.userName ?? "-"}`,
        `Comment User Email: ${comment.userEmail ?? "-"}`,
        "",
        "Comment:",
        comment.body,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[support-ticket-mail] comment notification failed", error);
  }
}

