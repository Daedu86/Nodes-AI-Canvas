"use client";

// Lightweight per-message model registry persisted in localStorage.
// This is used to remember which model/provider were active when a message was created.

export type ModelEntry = { model: string; provider: "ollama" | "openrouter" | string };

const KEY = "a-ui.message-models.v1";

function readRegistry(): Record<string, ModelEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ModelEntry>;
  } catch {
    return {};
  }
}

function writeRegistry(data: Record<string, ModelEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getModelEntry(messageId: string): ModelEntry | undefined {
  if (!messageId) return undefined;
  const map = readRegistry();
  return map[messageId];
}

export function rememberModelEntry(messageId: string, entry: ModelEntry) {
  if (!messageId || !entry?.model) return;
  const map = readRegistry();
  const existing = map[messageId];
  if (existing && existing.model === entry.model && existing.provider === entry.provider) return;
  map[messageId] = entry;
  writeRegistry(map);
}
