import {
  normalizeProjectMemoryItem,
  type ProjectMemoryItem,
  type ProjectMemorySourceKind,
  type ProjectMemoryType,
} from "@/lib/memory-documents";
import { fetchApi, fetchJson } from "@/lib/client/persisted-resource-client";

export type CreateMemoryItemInput = {
  content: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title: string;
  type: ProjectMemoryType;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const requireMemoryItem = (value: unknown) => {
  const item = normalizeProjectMemoryItem(value);
  if (!item) throw new Error("Invalid memory item response.");
  return item;
};

export async function fetchMemoryItems(): Promise<ProjectMemoryItem[]> {
  const payload = asRecord(await fetchJson<unknown>("/api/memory"));
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("Invalid memory list response.");
  }
  return payload.items.map(requireMemoryItem);
}

export async function createMemoryItem(
  input: CreateMemoryItemInput,
): Promise<ProjectMemoryItem> {
  const payload = asRecord(
    await fetchJson<unknown>("/api/memory", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return requireMemoryItem(payload?.item);
}

export async function deleteMemoryItem(memoryId: string): Promise<void> {
  await fetchApi(
    "/api/memory/" + encodeURIComponent(memoryId),
    { method: "DELETE" },
    { allowedStatuses: [404] },
  );
}
