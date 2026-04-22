export type SupportTicketKind = "issue" | "question" | "feature";

export type SupportTicketStatus = "open" | "closed";

export type SupportTicketComment = {
  id: string;
  body: string;
  createdAt: string;
  userEmail: string | null;
  userId: string;
  userName: string | null;
};

export type SupportTicket = {
  id: string;
  title: string;
  body: string;
  kind: SupportTicketKind;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  ownerEmail: string | null;
  ownerId: string;
  ownerName: string | null;
  comments: SupportTicketComment[];
};

