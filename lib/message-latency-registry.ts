"use client";

export type MessageLatencyEntry = {
  responseStartMs: number | null;
  totalMs: number | null;
};

const KEY = "a-ui.message-latency.v1";

function readRegistry(): Record<string, MessageLatencyEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, MessageLatencyEntry>;
  } catch {
    return {};
  }
}

function writeRegistry(data: Record<string, MessageLatencyEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getMessageLatencyEntry(messageId: string): MessageLatencyEntry | undefined {
  if (!messageId) return undefined;
  const map = readRegistry();
  return map[messageId];
}

export function rememberMessageLatencyEntry(messageId: string, entry: MessageLatencyEntry) {
  if (!messageId) return;
  const map = readRegistry();
  const existing = map[messageId];
  if (
    existing &&
    existing.responseStartMs === entry.responseStartMs &&
    existing.totalMs === entry.totalMs
  ) {
    return;
  }
  map[messageId] = entry;
  writeRegistry(map);
}
