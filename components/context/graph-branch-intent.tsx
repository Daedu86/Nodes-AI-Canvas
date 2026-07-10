"use client";

import React from "react";
import type { BranchOperation } from "@/lib/thread-branching";

export type GraphBranchIntent = {
  anchorId: string;
  operation: BranchOperation;
  text: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  position?: { x: number; y: number } | null;
};

type BeginDraftOptions = {
  inputArtifactIds?: string[];
  outputArtifactIds?: string[];
  position?: { x: number; y: number } | null;
};

type GraphBranchIntentContextValue = {
  draft: GraphBranchIntent | null;
  beginDraft: (
    anchorId: string,
    operation: BranchOperation,
    initialText?: string,
    options?: BeginDraftOptions,
  ) => void;
  cancelDraft: () => void;
  setDraftArtifactIds: (
    relation: "input" | "output",
    artifactIds: string[],
  ) => void;
  setDraftText: (value: string) => void;
  setDraftPosition: (position: { x: number; y: number } | null) => void;
  toggleDraftArtifact: (
    relation: "input" | "output",
    artifactId: string,
  ) => void;
};

const GraphBranchIntentContext = React.createContext<
  GraphBranchIntentContextValue | undefined
>(undefined);

const uniqueIds = (ids: string[]) =>
  Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0)));

export function GraphBranchIntentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState<GraphBranchIntent | null>(null);

  const beginDraft = React.useCallback(
    (
      anchorId: string,
      operation: BranchOperation,
      initialText = "",
      options: BeginDraftOptions = {},
    ) => {
      setDraft({
        anchorId,
        operation,
        text: initialText,
        inputArtifactIds: uniqueIds(options.inputArtifactIds ?? []),
        outputArtifactIds: uniqueIds(options.outputArtifactIds ?? []),
        position: options.position ?? null,
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

  const setDraftPosition = React.useCallback((position: { x: number; y: number } | null) => {
    setDraft((current) => (current ? { ...current, position } : current));
  }, []);

  const setDraftArtifactIds = React.useCallback(
    (relation: "input" | "output", artifactIds: string[]) => {
      setDraft((current) => {
        if (!current) return current;
        const key = relation === "input" ? "inputArtifactIds" : "outputArtifactIds";
        return { ...current, [key]: uniqueIds(artifactIds) };
      });
    },
    [],
  );

  const toggleDraftArtifact = React.useCallback(
    (relation: "input" | "output", artifactId: string) => {
      setDraft((current) => {
        if (!current || !artifactId) return current;
        const key = relation === "input" ? "inputArtifactIds" : "outputArtifactIds";
        const currentIds = current[key];
        const nextIds = currentIds.includes(artifactId)
          ? currentIds.filter((id) => id !== artifactId)
          : [...currentIds, artifactId];
        return { ...current, [key]: nextIds };
      });
    },
    [],
  );

  const value = React.useMemo(
    () => ({
      draft,
      beginDraft,
      cancelDraft,
      setDraftArtifactIds,
      setDraftPosition,
      setDraftText,
      toggleDraftArtifact,
    }),
    [
      beginDraft,
      cancelDraft,
      draft,
      setDraftArtifactIds,
      setDraftPosition,
      setDraftText,
      toggleDraftArtifact,
    ],
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
