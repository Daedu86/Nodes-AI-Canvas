"use client";

import React from "react";
import {
  createMemoryItem as createMemoryItemRequest,
  deleteMemoryItem as deleteMemoryItemRequest,
  fetchMemoryItems,
  type CreateMemoryItemInput,
} from "@/lib/client/memory-client";
import {
  prependUniqueResource,
  removeResourceById,
} from "@/lib/client/persisted-resource-client";
import type { ProjectMemoryItem } from "@/lib/memory-documents";

type ReusableMemoryContextValue = {
  createMemoryItem: (input: CreateMemoryItemInput) => Promise<ProjectMemoryItem>;
  deleteMemoryItem: (memoryId: string) => Promise<void>;
  isReady: boolean;
  items: ProjectMemoryItem[];
  refreshMemoryItems: () => Promise<ProjectMemoryItem[]>;
};

const ReusableMemoryContext = React.createContext<ReusableMemoryContextValue | null>(null);

export function ReusableMemoryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ProjectMemoryItem[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  const refreshMemoryItems = React.useCallback(async () => {
    const nextItems = await fetchMemoryItems();
    setItems(nextItems);
    return nextItems;
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        await refreshMemoryItems();
      } finally {
        if (mounted) setIsReady(true);
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshMemoryItems]);

  const createMemoryItem = React.useCallback(async (input: CreateMemoryItemInput) => {
    const item = await createMemoryItemRequest(input);
    setItems((previous) => prependUniqueResource(previous, item));
    return item;
  }, []);

  const deleteMemoryItem = React.useCallback(async (memoryId: string) => {
    await deleteMemoryItemRequest(memoryId);
    setItems((previous) => removeResourceById(previous, memoryId));
  }, []);

  const value = React.useMemo<ReusableMemoryContextValue>(
    () => ({
      createMemoryItem,
      deleteMemoryItem,
      isReady,
      items,
      refreshMemoryItems,
    }),
    [createMemoryItem, deleteMemoryItem, isReady, items, refreshMemoryItems],
  );

  return (
    <ReusableMemoryContext.Provider value={value}>
      {children}
    </ReusableMemoryContext.Provider>
  );
}

export function useReusableMemory() {
  const context = React.useContext(ReusableMemoryContext);
  if (!context) {
    throw new Error("useReusableMemory must be used within ReusableMemoryProvider");
  }
  return context;
}
