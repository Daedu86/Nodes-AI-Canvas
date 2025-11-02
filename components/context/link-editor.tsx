"use client";

import React from "react";

type OverrideEntry = {
  parentId: string | null;
  originalParentId: string | null;
};

type LinkEditorContextValue = {
  overrides: Map<string, OverrideEntry>;
  getParentId: (childId?: string | null, fallback?: string | null) => string | null;
  cutLink: (childId: string, parentId: string | null) => void;
  restoreLink: (childId: string) => void;
  resetLinks: () => void;
  isCut: (childId: string) => boolean;
};

const STORAGE_KEY = "threadGraph.linkOverrides.v1";

const LinkEditorContext = React.createContext<LinkEditorContextValue | undefined>(undefined);

export function LinkEditorProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = React.useState<Map<string, OverrideEntry>>(new Map());

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, OverrideEntry>;
      const map = new Map<string, OverrideEntry>();
      Object.entries(parsed).forEach(([childId, entry]) => {
        if (!entry || typeof entry !== "object") return;
        map.set(childId, {
          parentId: entry.parentId ?? null,
          originalParentId: entry.originalParentId ?? null,
        });
      });
      if (map.size > 0) {
        setOverrides(map);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      if (overrides.size === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const obj: Record<string, OverrideEntry> = {};
      overrides.forEach((entry, childId) => {
        obj[childId] = entry;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }, [overrides]);

  const getParentId = React.useCallback(
    (childId?: string | null, fallback?: string | null) => {
      if (!childId) return fallback ?? null;
      const entry = overrides.get(childId);
      if (!entry) return fallback ?? null;
      return entry.parentId;
    },
    [overrides],
  );

  const cutLink = React.useCallback((childId: string, parentId: string | null) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(childId, { parentId: null, originalParentId: parentId });
      return next;
    });
  }, []);

  const restoreLink = React.useCallback((childId: string) => {
    setOverrides((prev) => {
      if (!prev.has(childId)) return prev;
      const next = new Map(prev);
      next.delete(childId);
      return next;
    });
  }, []);

  const resetLinks = React.useCallback(() => {
    setOverrides(new Map());
  }, []);

  const value = React.useMemo<LinkEditorContextValue>(
    () => ({
      overrides,
      getParentId,
      cutLink,
      restoreLink,
      resetLinks,
      isCut: (childId: string) => overrides.has(childId),
    }),
    [overrides, getParentId, cutLink, restoreLink, resetLinks],
  );

  return <LinkEditorContext.Provider value={value}>{children}</LinkEditorContext.Provider>;
}

export function useLinkEditor() {
  const ctx = React.useContext(LinkEditorContext);
  if (!ctx) {
    throw new Error("useLinkEditor must be used within a LinkEditorProvider");
  }
  return ctx;
}
