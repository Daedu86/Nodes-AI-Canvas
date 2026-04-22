import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SupportTicket,
  SupportTicketComment,
  SupportTicketKind,
  SupportTicketStatus,
} from "@/lib/support-ticket-documents";

const TICKET_FILE_EXTENSION = ".json";

const normalizeNonEmpty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeKind = (value: unknown): SupportTicketKind =>
  value === "feature" || value === "question" ? value : "issue";

const normalizeStatus = (value: unknown): SupportTicketStatus =>
  value === "closed" ? "closed" : "open";

const ensureSafeTicketId = (ticketId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    throw new Error(`Invalid ticket id: ${ticketId}`);
  }
};

const getSupportTicketStoreDir = () =>
  process.env.SUPPORT_TICKET_STORE_DIR
    ? path.resolve(process.env.SUPPORT_TICKET_STORE_DIR)
    : path.join(process.cwd(), "data", "support-tickets");

const getTicketFilePath = (ticketId: string) => {
  ensureSafeTicketId(ticketId);
  return path.join(getSupportTicketStoreDir(), `${ticketId}${TICKET_FILE_EXTENSION}`);
};

async function ensureStoreDir() {
  await fs.mkdir(getSupportTicketStoreDir(), { recursive: true });
}

const normalizeComment = (value: unknown): SupportTicketComment | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<SupportTicketComment>;
  const body = normalizeNonEmpty(entry.body);
  const userId = normalizeNonEmpty(entry.userId);
  const createdAt = normalizeNonEmpty(entry.createdAt) ?? new Date().toISOString();
  if (!body || !userId) return null;
  return {
    id: normalizeNonEmpty(entry.id) ?? randomUUID(),
    body,
    createdAt,
    userEmail: normalizeNonEmpty(entry.userEmail),
    userId,
    userName: normalizeNonEmpty(entry.userName),
  };
};

const normalizeTicket = (value: unknown, fallbackId: string): SupportTicket => {
  const raw = value && typeof value === "object" ? (value as Partial<SupportTicket>) : {};
  const ownerId = normalizeNonEmpty(raw.ownerId) ?? "unknown";
  const comments = Array.isArray(raw.comments)
    ? raw.comments
        .map((entry) => normalizeComment(entry))
        .filter((entry): entry is SupportTicketComment => Boolean(entry))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];
  const createdAt = normalizeNonEmpty(raw.createdAt) ?? new Date().toISOString();
  const updatedAt = normalizeNonEmpty(raw.updatedAt) ?? createdAt;
  return {
    id: normalizeNonEmpty(raw.id) ?? fallbackId,
    title: normalizeNonEmpty(raw.title) ?? "Untitled support ticket",
    body: normalizeNonEmpty(raw.body) ?? "",
    kind: normalizeKind(raw.kind),
    status: normalizeStatus(raw.status),
    createdAt,
    updatedAt,
    ownerEmail: normalizeNonEmpty(raw.ownerEmail),
    ownerId,
    ownerName: normalizeNonEmpty(raw.ownerName),
    comments,
  };
};

async function writeTicket(ticket: SupportTicket) {
  await ensureStoreDir();
  const filePath = getTicketFilePath(ticket.id);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(ticket, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readTicketFromPath(filePath: string): Promise<SupportTicket> {
  const raw = await fs.readFile(filePath, "utf8");
  return normalizeTicket(
    JSON.parse(raw) as unknown,
    path.basename(filePath, TICKET_FILE_EXTENSION),
  );
}

async function readAllTickets() {
  await ensureStoreDir();
  const entries = await fs.readdir(getSupportTicketStoreDir(), { withFileTypes: true });
  const tickets = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(TICKET_FILE_EXTENSION))
      .map((entry) => readTicketFromPath(path.join(getSupportTicketStoreDir(), entry.name))),
  );
  return tickets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function readTicketById(ticketId: string) {
  return readTicketFromPath(getTicketFilePath(ticketId));
}

export async function listSupportTicketsForUser(ownerId: string) {
  const tickets = await readAllTickets();
  return tickets.filter((ticket) => ticket.ownerId === ownerId);
}

export async function getSupportTicketForUser(ticketId: string, ownerId: string) {
  const ticket = await readTicketById(ticketId);
  if (ticket.ownerId !== ownerId) {
    throw new Error("Support ticket not found");
  }
  return ticket;
}

export async function createSupportTicketForUser(input: {
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  title: string;
  body: string;
  kind: SupportTicketKind;
}) {
  const title = normalizeNonEmpty(input.title);
  const body = normalizeNonEmpty(input.body);
  if (!title || !body) {
    throw new Error("Title and description are required");
  }
  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: randomUUID(),
    title,
    body,
    kind: normalizeKind(input.kind),
    status: "open",
    createdAt: now,
    updatedAt: now,
    ownerEmail: normalizeNonEmpty(input.ownerEmail),
    ownerId: input.ownerId,
    ownerName: normalizeNonEmpty(input.ownerName),
    comments: [],
  };
  await writeTicket(ticket);
  return ticket;
}

export async function addSupportTicketCommentForUser(input: {
  ticketId: string;
  ownerId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  body: string;
}) {
  const body = normalizeNonEmpty(input.body);
  if (!body) {
    throw new Error("Comment text is required");
  }
  const ticket = await getSupportTicketForUser(input.ticketId, input.ownerId);
  const comment: SupportTicketComment = {
    id: randomUUID(),
    body,
    createdAt: new Date().toISOString(),
    userEmail: normalizeNonEmpty(input.userEmail),
    userId: input.userId,
    userName: normalizeNonEmpty(input.userName),
  };
  const next: SupportTicket = {
    ...ticket,
    updatedAt: comment.createdAt,
    comments: [...ticket.comments, comment],
  };
  await writeTicket(next);
  return { ticket: next, comment };
}

