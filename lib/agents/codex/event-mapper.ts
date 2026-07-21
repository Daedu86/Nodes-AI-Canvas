import type {
  CodexAppServerNotification,
  CodexCanvasEvent,
  CodexCanvasEventType,
} from "@/lib/agents/codex/types";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? (record[key] as string) : null;

const getItemType = (params: Record<string, unknown>) => {
  const item = asRecord(params.item);
  return readString(item, "type")?.toLowerCase() ?? "";
};

const cleanTextParts = (parts: string[]) =>
  parts
    .map((part) => part.replace(/\r\n/g, "\n"))
    .filter((part) => part.length > 0);

const extractStructuredText = (value: unknown): string | null => {
  if (typeof value === "string") return value.length > 0 ? value : null;

  if (Array.isArray(value)) {
    const parts = cleanTextParts(
      value
        .map((entry) => extractStructuredText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    );
    if (!parts.length) return null;

    // Completed message content is semantic content, not token streaming. Joining
    // independent blocks with newlines preserves word boundaries even when the
    // app-server serializes text as multiple content entries.
    return parts.join("\n");
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) return null;

  for (const key of ["text", "output_text", "content", "value", "message"]) {
    const candidate = extractStructuredText(record[key]);
    if (candidate) return candidate;
  }

  return null;
};

const whitespaceScore = (value: string) => {
  const whitespace = (value.match(/\s/g) ?? []).length;
  const wordTransitions = (value.match(/[\p{L}\p{N}][\s][\p{L}\p{N}]/gu) ?? []).length;
  return whitespace * 2 + wordTransitions * 4;
};

const normalizeCompletedAgentParams = (params: Record<string, unknown>) => {
  const item = asRecord(params.item);
  const message = asRecord(params.message);
  const candidates = [
    extractStructuredText(params.content),
    extractStructuredText(item.content),
    extractStructuredText(message.content),
    typeof params.text === "string" ? params.text : null,
    typeof item.text === "string" ? item.text : null,
    typeof message.text === "string" ? message.text : null,
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  if (!candidates.length) return params;

  // Prefer the representation that actually contains natural word boundaries.
  // Some Codex app-server payloads expose a compact text field while structured
  // content contains the correctly spaced final message.
  const best = candidates.reduce((current, candidate) => {
    const currentScore = whitespaceScore(current);
    const candidateScore = whitespaceScore(candidate);
    if (candidateScore !== currentScore) {
      return candidateScore > currentScore ? candidate : current;
    }
    return candidate.length > current.length ? candidate : current;
  });

  return { ...params, text: best };
};

function mapItemEvent(method: string, params: Record<string, unknown>): CodexCanvasEventType {
  const itemType = getItemType(params);
  const started = method.endsWith("/started");
  const completed = method.endsWith("/completed");

  if (itemType.includes("command") || itemType.includes("shell")) {
    return started ? "shell.started" : completed ? "shell.completed" : "unknown";
  }
  if (itemType.includes("file") || itemType.includes("patch")) {
    return "file.changed";
  }
  if (itemType.includes("tool")) {
    return started ? "tool.started" : completed ? "tool.completed" : "unknown";
  }
  if (itemType.includes("agentmessage") || itemType.includes("agent_message")) {
    return completed ? "agent.message.completed" : "unknown";
  }
  if (itemType.includes("spawn") || itemType.includes("subagent") || itemType.includes("child")) {
    return "agent.child.spawned";
  }
  return "unknown";
}

function mapMethod(method: string, params: Record<string, unknown>): CodexCanvasEventType {
  const normalized = method.toLowerCase();
  if (normalized === "agent/child/spawned" || normalized === "thread/child/spawned") {
    return "agent.child.spawned";
  }
  if (normalized === "turn/started" || normalized === "thread/started") return "agent.started";
  if (normalized === "item/agentmessage/delta") return "agent.message.delta";
  if (normalized.includes("approval") && normalized.endsWith("requested")) return "approval.requested";
  if (normalized.includes("approval") && (normalized.endsWith("resolved") || normalized.endsWith("completed"))) {
    return "approval.resolved";
  }
  if (normalized === "turn/completed") return "run.completed";
  if (normalized === "turn/failed") return "run.failed";
  if (normalized === "turn/cancelled" || normalized === "turn/canceled") return "run.cancelled";
  if (normalized === "item/started" || normalized === "item/completed") {
    return mapItemEvent(normalized, params);
  }
  return "unknown";
}

export function normalizeCodexNotification(input: {
  notification: CodexAppServerNotification;
  runId: string;
  eventId?: string;
  createdAt?: string;
  threadId?: string | null;
  parentRunId?: string | null;
  agentId?: string | null;
}): CodexCanvasEvent {
  const rawParams = asRecord(input.notification.params);
  const eventType = mapMethod(input.notification.method, rawParams);
  const params =
    eventType === "agent.message.completed"
      ? normalizeCompletedAgentParams(rawParams)
      : rawParams;
  const inferredThreadId =
    input.threadId ?? readString(params, "threadId") ?? readString(params, "thread_id");

  return {
    id: input.eventId ?? crypto.randomUUID(),
    runId: input.runId,
    threadId: inferredThreadId,
    parentRunId: input.parentRunId ?? null,
    agentId: input.agentId ?? null,
    type: eventType,
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: {
      method: input.notification.method,
      params,
    },
  };
}
