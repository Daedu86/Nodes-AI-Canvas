"use client";

import React from "react";
import type { BranchOperation } from "@/lib/thread-branching";

type GraphBranchIntent = {
  anchorId: string;
  operation: BranchOperation;
  text: string;
};

type GraphBranchIntentContextValue = {
  draft: GraphBranchIntent | null;
  beginDraft: (anchorId: string, operation: BranchOperation, initialText?: string) => void;
  cancelDraft: () => void;
  setDraftText: (value: string) => void;
};

const GraphBranchIntentContext = React.createContext<
  GraphBranchIntentContextValue | undefined
>(undefined);

export function GraphBranchIntentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState<GraphBranchIntent | null>(null);

  const beginDraft = React.useCallback(
    (anchorId: string, operation: BranchOperation, initialText = "") => {
      setDraft({ anchorId, operation, text: initialText });
    },
    [],
  );

  const cancelDraft = React.useCallback(() => {
    setDraft(null);
  }, []);

  const setDraftText = React.useCallback((value: string) => {
    setDraft((current) => (current ? { ...current, text: value } : current));
  }, []);

  const value = React.useMemo(
    () => ({
      draft,
      beginDraft,
      cancelDraft,
      setDraftText,
    }),
    [beginDraft, cancelDraft, draft, setDraftText],
  );

  return (
    <GraphBranchIntentContext.Provider value={value}>
      {children}
    </GraphBranchIntentContext.Provider>
  );
}

export function useGraphBranchIntent() {
  const context = React.useContext(GraphBranchIntentContext);
  if (!context) {
    throw new Error("useGraphBranchIntent must be used within a GraphBranchIntentProvider");
  }
  return context;
}
