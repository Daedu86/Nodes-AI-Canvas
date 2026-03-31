const SUPPORTED_MESSAGE_ROLES = ["system", "user", "assistant"] as const;

export type NormalizedLlmMessageRole = (typeof SUPPORTED_MESSAGE_ROLES)[number];

type MessageContentRecord = Record<string, unknown>;

export type NormalizedLlmMessagePart = {
  type: string;
  summary: string;
  text?: string;
  toolName?: string;
  mimeType?: string;
  name?: string;
};

export type NormalizedMessageContent = {
  content: string;
  textContent: string;
  parts: NormalizedLlmMessagePart[];
};

export type NormalizedLlmMessage = {
  id?: string;
  role: NormalizedLlmMessageRole;
  content: string;
  textContent: string;
  parts: NormalizedLlmMessagePart[];
};

type MessageLike = {
  id?: unknown;
  role: NormalizedLlmMessageRole;
  content?: unknown;
  parts?: unknown;
};

const isRecord = (value: unknown): value is MessageContentRecord =>
  typeof value === "object" && value !== null;

const getFirstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const normalizeMessageContentPart = (value: unknown): NormalizedLlmMessagePart | null => {
  if (!isRecord(value)) {
    return null;
  }

  const type = getFirstNonEmptyString(value.type);
  if (!type) {
    return null;
  }

  if (type === "text") {
    const text = typeof value.text === "string" ? value.text : "";
    if (!text) {
      return null;
    }
    return { type, text, summary: text };
  }

  if (type === "image") {
    const mimeType = getFirstNonEmptyString(value.mediaType, value.mimeType);
    return {
      type,
      mimeType,
      summary: mimeType ? `[image: ${mimeType}]` : "[image]",
    };
  }

  if (type === "file") {
    const name = getFirstNonEmptyString(value.filename, value.name);
    const mimeType = getFirstNonEmptyString(value.mediaType, value.mimeType);
    const descriptor = name ?? mimeType;
    return {
      type,
      mimeType,
      name,
      summary: descriptor ? `[file: ${descriptor}]` : "[file]",
    };
  }

  if (type === "tool-call") {
    const toolName = getFirstNonEmptyString(value.toolName);
    return {
      type,
      toolName,
      summary: toolName ? `[tool call: ${toolName}]` : "[tool call]",
    };
  }

  if (type === "tool-result") {
    const toolName = getFirstNonEmptyString(value.toolName);
    return {
      type,
      toolName,
      summary: toolName ? `[tool result: ${toolName}]` : "[tool result]",
    };
  }

  if (type === "source") {
    const source = isRecord(value.source) ? value.source : null;
    const sourceLabel = source
      ? getFirstNonEmptyString(source.title, source.url, source.sourceType)
      : undefined;
    return {
      type,
      summary: sourceLabel ? `[source: ${sourceLabel}]` : "[source]",
    };
  }

  return {
    type,
    summary: `[part: ${type}]`,
  };
};

export const normalizeMessageContent = (content: unknown): NormalizedMessageContent | null => {
  if (typeof content === "string") {
    return {
      content,
      textContent: content,
      parts: content ? [{ type: "text", text: content, summary: content }] : [],
    };
  }
  if (!Array.isArray(content)) return null;

  const parts = content
    .map((part) => normalizeMessageContentPart(part))
    .filter((part): part is NormalizedLlmMessagePart => part !== null && part.summary.length > 0);
  const textContent = parts
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n");
  const normalizedContent = parts.map((part) => part.summary).join("\n");

  if (parts.length === 0 && normalizedContent.trim().length === 0) {
    return null;
  }

  return {
    content: normalizedContent,
    textContent,
    parts,
  };
};

const normalizeMessageValue = (value: { content?: unknown; parts?: unknown }) =>
  normalizeMessageContent(value.parts) ?? normalizeMessageContent(value.content);

const isMessageLike = (value: unknown): value is MessageLike => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeMessage = value as { role?: unknown; content?: unknown; parts?: unknown };
  const normalizedContent = normalizeMessageValue(maybeMessage);
  return (
    SUPPORTED_MESSAGE_ROLES.includes(maybeMessage.role as NormalizedLlmMessageRole) &&
    normalizedContent !== null &&
    (normalizedContent.content.trim().length > 0 || normalizedContent.parts.length > 0)
  );
};

export function normalizeMessages(rawMessages: unknown[]): NormalizedLlmMessage[] {
  return rawMessages
    .filter(isMessageLike)
    .map((message) => {
      const normalizedContent = normalizeMessageValue(message);
      if (normalizedContent === null) {
        return null;
      }

      return {
        ...(typeof message.id === "string" ? { id: message.id } : {}),
        role: message.role,
        content: normalizedContent.content,
        textContent: normalizedContent.textContent,
        parts: normalizedContent.parts,
      };
    })
    .filter((message): message is NormalizedLlmMessage => message !== null);
}

export function selectMessagesForHistoryMode(
  messages: NormalizedLlmMessage[],
  historyMode?: string,
): NormalizedLlmMessage[] {
  if (historyMode === "full") {
    return messages;
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim().length > 0);
  if (lastUserMessage) {
    return [lastUserMessage];
  }

  const lastMessage = [...messages].reverse().find((message) => message.content.trim().length > 0);
  return lastMessage ? [lastMessage] : [];
}

export function toPlainTextTranscript(
  messages: Array<Pick<NormalizedLlmMessage, "role" | "content">>,
): string {
  return messages
    .flatMap((message) => (message.content.trim() ? [`${message.role}: ${message.content}`] : []))
    .join("\n");
}
