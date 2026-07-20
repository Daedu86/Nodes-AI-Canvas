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
  const params = asRecord(input.notification.params);
  const inferredThreadId =
    input.threadId ?? readString(params, "threadId") ?? readString(params, "thread_id");

  return {
    id: input.eventId ?? crypto.randomUUID(),
    runId: input.runId,
    threadId: inferredThreadId,
    parentRunId: input.parentRunId ?? null,
    agentId: input.agentId ?? null,
    type: mapMethod(input.notification.method, params),
    createdAt: input.createdAt ?? new Date().toISOString(),
    payload: {
      method: input.notification.method,
      params,
    },
  };
}
