import type {
  ProjectMemoryItem,
  ProjectMemorySourceKind,
  ProjectMemoryType,
} from "@/lib/memory-documents";

export type MemoryListOptions = {
  ownerId?: string;
};

export type MemoryCreateInput = {
  content: string;
  ownerId?: string;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title: string;
  type: ProjectMemoryType;
};

export type MemoryPatch = {
  content?: string;
  ownerId?: string | null;
  sourceProjectId?: string | null;
  sourceKeys?: string[];
  sourceKind?: ProjectMemorySourceKind;
  sourceSessionId?: string | null;
  title?: string | null;
  type?: ProjectMemoryType;
};

export interface MemoryRepository {
  createMemoryItem(input: MemoryCreateInput): Promise<ProjectMemoryItem>;
  deleteMemoryItem(memoryId: string, ownerId?: string): Promise<void>;
  deleteMemoryItems(memoryIds: string[], ownerId?: string): Promise<void>;
  getMemoryItem(memoryId: string, ownerId?: string): Promise<ProjectMemoryItem>;
  listMemoryItems(options?: MemoryListOptions): Promise<ProjectMemoryItem[]>;
  patchMemoryItem(memoryId: string, patch: MemoryPatch, ownerId?: string): Promise<ProjectMemoryItem>;
}
