"use client";

import React from "react";
import { useSessionUiState } from "@/components/context/session-ui-state";

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

const LinkEditorContext = React.createContext<LinkEditorContextValue | undefined>(undefined);

export function LinkEditorProvider({ children }: { children: React.ReactNode }) {
  const { linkOverrides: overrides, setLinkOverrides } = useSessionUiState();

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
    setLinkOverrides((prev) => {
      const next = new Map(prev);
      next.set(childId, { parentId: null, originalParentId: parentId });
      return next;
    });
  }, [setLinkOverrides]);

  const restoreLink = React.useCallback((childId: string) => {
    setLinkOverrides((prev) => {
      if (!prev.has(childId)) return prev;
      const next = new Map(prev);
      next.delete(childId);
      return next;
    });
  }, [setLinkOverrides]);

  const resetLinks = React.useCallback(() => {
    setLinkOverrides(new Map());
  }, [setLinkOverrides]);

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
