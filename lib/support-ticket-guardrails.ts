export const SUPPORT_TICKET_MAX_PER_USER = 5;
export const SUPPORT_TICKET_MAX_TITLE_CHARS = 120;
export const SUPPORT_TICKET_MAX_BODY_CHARS = 2000;
export const SUPPORT_TICKET_MAX_COMMENT_CHARS = 1000;

export const SUPPORT_TICKET_ATTACHMENT_MESSAGE =
  "Attachments are disabled on the free-tier support flow.";

export const truncateToLimit = (value: string, limit: number) =>
  value.length > limit ? value.slice(0, limit) : value;

