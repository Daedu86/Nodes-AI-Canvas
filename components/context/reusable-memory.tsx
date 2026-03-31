"use client";

import React from "react";
import type {
  ProjectMemoryItem,
  ProjectMemorySourceKind,
  ProjectMemoryType,
} from "@/lib/memory-documents";

type MemoryResponse = {
  item: ProjectMemoryItem;
};

type MemoryListResponse = {
  items: ProjectMemoryItem[];
};

type ReusableMemoryContextValue = {
  createMemoryItem: (input: {
    content: string;
    sourceProjectId?: string | null;
    sourceKeys?: string[];
    sourceKind?: ProjectMemorySourceKind;
    sourceSessionId?: string | null;
    title: string;
    type: ProjectMemoryType;
  }) => Promise<ProjectMemoryItem>;
  deleteMemoryItem: (memoryId: string) => Promise<void>;
  isReady: boolean;
  items: ProjectMemoryItem[];
  refreshMemoryItems: () => Promise<ProjectMemoryItem[]>;
};

const ReusableMemoryContext = React.createContext<ReusableMemoryContextValue | null>(null);

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function ReusableMemoryProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ProjectMemoryItem[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  const refreshMemoryItems = React.useCallback(async () => {
    const data = await fetchJson<MemoryListResponse>("/api/memory");
    setItems(data.items);
    return data.items;
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        await refreshMemoryItems();
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    };
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshMemoryItems]);

  const createMemoryItem = React.useCallback(async (input: {
    content: string;
    sourceProjectId?: string | null;
    sourceKeys?: string[];
    sourceKind?: ProjectMemorySourceKind;
    sourceSessionId?: string | null;
    title: string;
    type: ProjectMemoryType;
  }) => {
    const data = await fetchJson<MemoryResponse>("/api/memory", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setItems((prev) => [data.item, ...prev]);
    return data.item;
  }, []);

  const deleteMemoryItem = React.useCallback(async (memoryId: string) => {
    const response = await fetch(`/api/memory/${memoryId}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Request failed: ${response.status}`);
    }
    setItems((prev) => prev.filter((item) => item.id !== memoryId));
  }, []);

  const value = React.useMemo<ReusableMemoryContextValue>(() => ({
    createMemoryItem,
    deleteMemoryItem,
    isReady,
    items,
    refreshMemoryItems,
  }), [createMemoryItem, deleteMemoryItem, isReady, items, refreshMemoryItems]);

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
