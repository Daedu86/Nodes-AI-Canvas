"use client";

import React from "react";
import { buildSessionBrief, type SessionBrief } from "@/lib/session-brief";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import {
  buildSessionWiki,
  type SessionWiki,
  type SessionWikiNode,
  type SessionWikiPageId,
} from "@/lib/session-wiki";

type SessionKnowledgeSnapshot = {
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  nodes: SessionWikiNode[];
  selectedNodeId: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
};

type SessionKnowledgeContextValue = {
  brief: SessionBrief | null;
  publishSnapshot: (snapshot: SessionKnowledgeSnapshot | null) => void;
  selectedWikiPageId: SessionWikiPageId;
  setSelectedWikiPageId: (value: SessionWikiPageId) => void;
  snapshot: SessionKnowledgeSnapshot | null;
  wiki: SessionWiki | null;
};

const SessionKnowledgeContext = React.createContext<SessionKnowledgeContextValue | null>(null);

export function SessionKnowledgeProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<SessionKnowledgeSnapshot | null>(null);
  const [selectedWikiPageId, setSelectedWikiPageId] = React.useState<SessionWikiPageId>("overview");

  const wiki = React.useMemo(
    () =>
      snapshot
        ? buildSessionWiki({
            artifacts: snapshot.artifacts,
            contextLinks: snapshot.contextLinks,
            nodes: snapshot.nodes,
            selectedNodeId: snapshot.selectedNodeId,
            sessionTitle: snapshot.sessionTitle,
          })
        : null,
    [snapshot],
  );

  const brief = React.useMemo(
    () =>
      snapshot
        ? buildSessionBrief({
            artifacts: snapshot.artifacts,
            sessionTitle: snapshot.sessionTitle,
            wiki,
          })
        : null,
    [snapshot, wiki],
  );

  React.useEffect(() => {
    setSelectedWikiPageId("overview");
  }, [snapshot?.sessionId]);

  const value = React.useMemo<SessionKnowledgeContextValue>(
    () => ({
      brief,
      publishSnapshot: setSnapshot,
      selectedWikiPageId,
      setSelectedWikiPageId,
      snapshot,
      wiki,
    }),
    [brief, selectedWikiPageId, snapshot, wiki],
  );

  return (
    <SessionKnowledgeContext.Provider value={value}>
      {children}
    </SessionKnowledgeContext.Provider>
  );
}

export function useSessionKnowledge() {
  const context = React.useContext(SessionKnowledgeContext);
  if (!context) {
    throw new Error("useSessionKnowledge must be used within SessionKnowledgeProvider");
  }
  return context;
}

export type { SessionKnowledgeSnapshot };
