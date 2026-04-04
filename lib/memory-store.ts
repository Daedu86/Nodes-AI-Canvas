import { getMemoryRepository } from "@/lib/persistence/repositories";
import type {
  MemoryCreateInput,
  MemoryListOptions,
  MemoryPatch,
} from "@/lib/persistence/memory-repository";

export type { MemoryCreateInput, MemoryListOptions, MemoryPatch };

export async function listMemoryItems(options: MemoryListOptions = {}) {
  return getMemoryRepository().listMemoryItems(options);
}

export async function getMemoryItem(memoryId: string, ownerId?: string) {
  return getMemoryRepository().getMemoryItem(memoryId, ownerId);
}

export async function createMemoryItem(input: MemoryCreateInput) {
  return getMemoryRepository().createMemoryItem(input);
}

export async function patchMemoryItem(memoryId: string, patch: MemoryPatch, ownerId?: string) {
  return getMemoryRepository().patchMemoryItem(memoryId, patch, ownerId);
}

export async function deleteMemoryItem(memoryId: string, ownerId?: string) {
  return getMemoryRepository().deleteMemoryItem(memoryId, ownerId);
}

export async function deleteMemoryItems(memoryIds: string[], ownerId?: string) {
  return getMemoryRepository().deleteMemoryItems(memoryIds, ownerId);
}
