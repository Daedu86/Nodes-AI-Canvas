"use client";

import React from "react";
import type { BranchOperation } from "@/lib/thread-branching";

type ThreadBranchDraft = {
  anchorId: string;
  operation: BranchOperation;
  text: string;
};

type ThreadBranchDraftContextValue = {
  draft: ThreadBranchDraft | null;
  beginDraft: (anchorId: string, operation: BranchOperation, initialText?: string) => void;
  cancelDraft: () => void;
  setDraftText: (value: string) => void;
};

const ThreadBranchDraftContext = React.createContext<ThreadBranchDraftContextValue | undefined>(
  undefined,
);

export function ThreadBranchDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = React.useState<ThreadBranchDraft | null>(null);

  const beginDraft = React.useCallback(
    (anchorId: string, operation: BranchOperation, initialText = "") => {
      setDraft({
        anchorId,
        operation,
        text: initialText,
      });
    },
    [],
  );

  const cancelDraft = React.useCallback(() => {
    setDraft(null);
  }, []);

  const setDraftText = React.useCallback((value: string) => {
    setDraft((current) => (current ? { ...current, text: value } : current));
  }, []);

  const value = React.useMemo<ThreadBranchDraftContextValue>(
    () => ({
      draft,
      beginDraft,
      cancelDraft,
      setDraftText,
    }),
    [beginDraft, cancelDraft, draft, setDraftText],
  );

  return (
    <ThreadBranchDraftContext.Provider value={value}>
      {children}
    </ThreadBranchDraftContext.Provider>
  );
}

export function useThreadBranchDraft() {
  const context = React.useContext(ThreadBranchDraftContext);
  if (!context) {
    throw new Error("useThreadBranchDraft must be used within a ThreadBranchDraftProvider");
  }
  return context;
}
