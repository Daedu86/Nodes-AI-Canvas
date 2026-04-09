"use client";

import React from "react";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import type {
  SessionArtifact,
  SessionArtifactSemanticType,
  SessionArtifactType,
  SessionContextLink,
} from "@/lib/session-artifacts";

type SessionArtifactsContextValue = {
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  createArtifact: (input: {
    artifactType: SessionArtifactType;
    semanticType?: SessionArtifactSemanticType | null;
    blobRef?: string | null;
    byteSize?: number | null;
    title: string;
    content: string;
    fileName?: string | null;
    language?: string | null;
    mimeType?: string | null;
    position?: SessionArtifact["position"];
    sourceDataUrl?: string | null;
  }) => SessionArtifact;
  deleteArtifact: (artifactId: string) => void;
  getArtifactsForTarget: (targetMessageId: string) => SessionArtifact[];
  isArtifactLinkedToTarget: (artifactId: string, targetMessageId: string) => boolean;
  linkArtifactToTarget: (artifactId: string, targetMessageId: string) => void;
  unlinkArtifactFromTarget: (artifactId: string, targetMessageId: string) => void;
  updateArtifact: (
    artifactId: string,
    patch: Partial<
      Pick<
        SessionArtifact,
        | "blobRef"
        | "byteSize"
        | "content"
        | "fileName"
        | "language"
        | "mimeType"
        | "position"
        | "semanticType"
        | "sourceDataUrl"
        | "title"
      >
    >,
  ) => void;
};

const SessionArtifactsContext = React.createContext<SessionArtifactsContextValue | null>(null);

const generateArtifactId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const generateLinkId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `link-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildArtifactStateSignature = (
  artifacts: SessionArtifact[],
  contextLinks: SessionContextLink[],
) =>
  JSON.stringify({
    artifacts,
    contextLinks,
  });

export function SessionArtifactsProvider({ children }: { children: React.ReactNode }) {
  const { activeSession, activeSessionId, saveActiveSessionDocumentPatch } = usePersistedSessions();
  const [artifacts, setArtifacts] = React.useState<SessionArtifact[]>(activeSession?.artifacts ?? []);
  const [contextLinks, setContextLinks] = React.useState<SessionContextLink[]>(
    activeSession?.contextLinks ?? [],
  );
  const hydratedSessionIdRef = React.useRef<string | null>(null);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const nextArtifacts = activeSession?.artifacts ?? [];
    const nextContextLinks = activeSession?.contextLinks ?? [];
    const nextSignature = buildArtifactStateSignature(nextArtifacts, nextContextLinks);
    const switchingSessions = hydratedSessionIdRef.current !== activeSessionId;
    const localSignature = buildArtifactStateSignature(artifacts, contextLinks);
    const hasUnsavedLocalChanges =
      hydratedSessionIdRef.current === activeSessionId &&
      localSignature !== lastSavedSignatureRef.current;

    if (switchingSessions) {
      setArtifacts(nextArtifacts);
      setContextLinks(nextContextLinks);
      hydratedSessionIdRef.current = activeSessionId ?? null;
      lastSavedSignatureRef.current = nextSignature;
      return;
    }

    if (nextSignature === lastSavedSignatureRef.current) {
      return;
    }

    if (hasUnsavedLocalChanges) {
      return;
    }

    setArtifacts(nextArtifacts);
    setContextLinks(nextContextLinks);
    lastSavedSignatureRef.current = nextSignature;
  }, [activeSession?.artifacts, activeSession?.contextLinks, activeSessionId, artifacts, contextLinks]);

  React.useEffect(() => {
    if (!activeSessionId || hydratedSessionIdRef.current !== activeSessionId) return;

    const flush = () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      const signature = buildArtifactStateSignature(artifacts, contextLinks);
      if (signature === lastSavedSignatureRef.current) return;
      lastSavedSignatureRef.current = signature;
      void saveActiveSessionDocumentPatch({ artifacts, contextLinks });
    };

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(flush, 200);
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeSessionId, artifacts, contextLinks, saveActiveSessionDocumentPatch]);

  const createArtifact = React.useCallback(
    (input: {
      artifactType: SessionArtifactType;
      semanticType?: SessionArtifactSemanticType | null;
      blobRef?: string | null;
      byteSize?: number | null;
      title: string;
      content: string;
      fileName?: string | null;
      language?: string | null;
      mimeType?: string | null;
      position?: SessionArtifact["position"];
      sourceDataUrl?: string | null;
    }) => {
      const now = new Date().toISOString();
      const artifact: SessionArtifact = {
        id: generateArtifactId(),
        artifactType: input.artifactType,
        semanticType: input.semanticType ?? null,
        blobRef: input.blobRef ?? null,
        byteSize: input.byteSize ?? null,
        title: input.title.trim(),
        content: input.content,
        fileName: input.fileName?.trim() || null,
        language: input.language?.trim() || null,
        mimeType: input.mimeType?.trim() || null,
        position: input.position ?? null,
        sourceDataUrl: input.sourceDataUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      setArtifacts((prev) => [artifact, ...prev]);
      return artifact;
    },
    [],
  );

  const updateArtifact = React.useCallback(
    (
      artifactId: string,
      patch: Partial<
        Pick<
          SessionArtifact,
          | "blobRef"
          | "byteSize"
          | "content"
          | "fileName"
          | "language"
          | "mimeType"
          | "position"
          | "semanticType"
          | "sourceDataUrl"
          | "title"
        >
      >,
    ) => {
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id !== artifactId
            ? artifact
            : {
                ...artifact,
                ...(patch.title !== undefined ? { title: patch.title.trim() || artifact.title } : {}),
                ...(patch.content !== undefined ? { content: patch.content } : {}),
                ...(patch.fileName !== undefined ? { fileName: patch.fileName?.trim() || null } : {}),
                ...(patch.language !== undefined ? { language: patch.language?.trim() || null } : {}),
                ...(patch.mimeType !== undefined ? { mimeType: patch.mimeType?.trim() || null } : {}),
                ...(patch.byteSize !== undefined ? { byteSize: patch.byteSize } : {}),
                ...(patch.blobRef !== undefined ? { blobRef: patch.blobRef } : {}),
                ...(patch.position !== undefined ? { position: patch.position } : {}),
                ...(patch.semanticType !== undefined ? { semanticType: patch.semanticType } : {}),
                ...(patch.sourceDataUrl !== undefined ? { sourceDataUrl: patch.sourceDataUrl } : {}),
                updatedAt: new Date().toISOString(),
              },
        ),
      );
    },
    [],
  );

  const deleteArtifact = React.useCallback((artifactId: string) => {
    setArtifacts((prev) => prev.filter((artifact) => artifact.id !== artifactId));
    setContextLinks((prev) => prev.filter((link) => link.artifactId !== artifactId));
  }, []);

  const linkArtifactToTarget = React.useCallback((artifactId: string, targetMessageId: string) => {
    setContextLinks((prev) => {
      if (
        prev.some(
          (link) => link.artifactId === artifactId && link.targetMessageId === targetMessageId,
        )
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          id: generateLinkId(),
          artifactId,
          targetMessageId,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const unlinkArtifactFromTarget = React.useCallback((artifactId: string, targetMessageId: string) => {
    setContextLinks((prev) =>
      prev.filter(
        (link) => !(link.artifactId === artifactId && link.targetMessageId === targetMessageId),
      ),
    );
  }, []);

  const getArtifactsForTarget = React.useCallback(
    (targetMessageId: string) => {
      const linkedIds = new Set(
        contextLinks
          .filter((link) => link.targetMessageId === targetMessageId)
          .map((link) => link.artifactId),
      );
      return artifacts.filter((artifact) => linkedIds.has(artifact.id));
    },
    [artifacts, contextLinks],
  );

  const isArtifactLinkedToTarget = React.useCallback(
    (artifactId: string, targetMessageId: string) =>
      contextLinks.some(
        (link) => link.artifactId === artifactId && link.targetMessageId === targetMessageId,
      ),
    [contextLinks],
  );

  const value = React.useMemo<SessionArtifactsContextValue>(
    () => ({
      artifacts,
      contextLinks,
      createArtifact,
      deleteArtifact,
      getArtifactsForTarget,
      isArtifactLinkedToTarget,
      linkArtifactToTarget,
      unlinkArtifactFromTarget,
      updateArtifact,
    }),
    [
      artifacts,
      contextLinks,
      createArtifact,
      deleteArtifact,
      getArtifactsForTarget,
      isArtifactLinkedToTarget,
      linkArtifactToTarget,
      unlinkArtifactFromTarget,
      updateArtifact,
    ],
  );

  return (
    <SessionArtifactsContext.Provider value={value}>
      {children}
    </SessionArtifactsContext.Provider>
  );
}

export function useSessionArtifacts() {
  const context = React.useContext(SessionArtifactsContext);
  if (!context) {
    throw new Error("useSessionArtifacts must be used within a SessionArtifactsProvider");
  }
  return context;
}
