"use client";

import React from "react";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import {
  applyResponseToArtifacts,
  appendArtifactRevision,
  getArtifactsForTarget as selectArtifactsForTarget,
  normalizeSessionCanvasLinks,
  restoreArtifactRevision as restoreRevision,
  validateSessionCanvasConnection,
  type SessionArtifact,
  type SessionArtifactRevisionOrigin,
  type SessionArtifactSemanticType,
  type SessionArtifactSyncMode,
  type SessionArtifactType,
  type SessionCanvasEndpoint,
  type SessionCanvasLink,
} from "@/lib/session-artifacts";

type ContextLinkView = SessionCanvasLink & {
  relation: "context";
  promptId: string;
  targetMessageId: string;
};

type CreateArtifactInput = {
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
  syncMode?: SessionArtifactSyncMode;
};

type ArtifactPatch = Partial<
  Pick<
    SessionArtifact,
    | "blobRef"
    | "byteSize"
    | "content"
    | "fileName"
    | "language"
    | "mimeType"
    | "position"
    | "promptCompletedAt"
    | "promptError"
    | "promptModel"
    | "promptProvider"
    | "promptResult"
    | "promptRunId"
    | "promptStartedAt"
    | "promptStatus"
    | "semanticType"
    | "sourceDataUrl"
    | "syncMode"
    | "title"
  >
>;

type SessionArtifactsContextValue = {
  artifacts: SessionArtifact[];
  canvasLinks: SessionCanvasLink[];
  contextLinks: ContextLinkView[];
  createArtifact: (input: CreateArtifactInput) => SessionArtifact;
  deleteArtifact: (artifactId: string) => void;
  updateArtifact: (
    artifactId: string,
    patch: ArtifactPatch,
    options?: {
      revisionOrigin?: SessionArtifactRevisionOrigin;
      revisionAuthor?: "model" | "user";
      promptId?: string | null;
      responseId?: string | null;
    },
  ) => void;
  getArtifactsForTarget: (targetMessageId: string) => SessionArtifact[];
  isArtifactLinkedToTarget: (artifactId: string, targetMessageId: string) => boolean;
  linkArtifactToTarget: (artifactId: string, targetMessageId: string) => void;
  unlinkArtifactFromTarget: (artifactId: string, targetMessageId: string) => void;
  connectCanvasBlocks: (
    source: SessionCanvasEndpoint,
    target: SessionCanvasEndpoint,
  ) => { ok: true; link: SessionCanvasLink } | { ok: false; message: string };
  removeCanvasLink: (linkId: string) => void;
  setArtifactSyncMode: (artifactId: string, syncMode: SessionArtifactSyncMode) => void;
  restoreArtifactRevision: (artifactId: string, revisionId: string) => void;
  applyCompletedResponse: (input: {
    promptId: string;
    responseId: string;
    sourcePromptId?: string | null;
    text: string;
    artifactIds?: string[];
  }) => { capturedArtifactIds: string[]; skippedArtifactIds: string[] };
};

const SessionArtifactsContext = React.createContext<SessionArtifactsContextValue | null>(null);

const generateId = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const stateSignature = (artifacts: SessionArtifact[], links: SessionCanvasLink[]) =>
  JSON.stringify({ artifacts, contextLinks: links });

export function SessionArtifactsProvider({ children }: { children: React.ReactNode }) {
  const { activeSession, activeSessionId, saveActiveSessionDocumentPatch } = usePersistedSessions();
  const [artifacts, setArtifacts] = React.useState<SessionArtifact[]>(activeSession?.artifacts ?? []);
  const [canvasLinks, setCanvasLinks] = React.useState<SessionCanvasLink[]>(
    normalizeSessionCanvasLinks(activeSession?.contextLinks ?? []),
  );
  const hydratedSessionIdRef = React.useRef<string | null>(null);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
  const artifactsRef = React.useRef<SessionArtifact[]>(artifacts);
  const canvasLinksRef = React.useRef<SessionCanvasLink[]>(canvasLinks);

  React.useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);

  React.useEffect(() => {
    canvasLinksRef.current = canvasLinks;
  }, [canvasLinks]);

  const contextLinks = React.useMemo<ContextLinkView[]>(
    () =>
      canvasLinks.flatMap((link) =>
        link.relation === "context" && link.promptId
          ? [
              {
                ...link,
                relation: "context" as const,
                promptId: link.promptId,
                targetMessageId: link.promptId,
              },
            ]
          : [],
      ),
    [canvasLinks],
  );

  React.useEffect(() => {
    const nextArtifacts = activeSession?.artifacts ?? [];
    const nextLinks = normalizeSessionCanvasLinks(activeSession?.contextLinks ?? []);
    const nextSignature = stateSignature(nextArtifacts, nextLinks);
    const switchingSessions = hydratedSessionIdRef.current !== activeSessionId;
    const localSignature = stateSignature(artifacts, canvasLinks);
    const hasUnsavedLocalChanges =
      hydratedSessionIdRef.current === activeSessionId &&
      localSignature !== lastSavedSignatureRef.current;

    if (switchingSessions) {
      setArtifacts(nextArtifacts);
      setCanvasLinks(nextLinks);
      hydratedSessionIdRef.current = activeSessionId ?? null;
      lastSavedSignatureRef.current = nextSignature;
      return;
    }
    if (nextSignature === lastSavedSignatureRef.current || hasUnsavedLocalChanges) return;
    setArtifacts(nextArtifacts);
    setCanvasLinks(nextLinks);
    lastSavedSignatureRef.current = nextSignature;
  }, [activeSession?.artifacts, activeSession?.contextLinks, activeSessionId, artifacts, canvasLinks]);

  React.useEffect(() => {
    if (!activeSessionId || hydratedSessionIdRef.current !== activeSessionId) return;
    const flush = () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const signature = stateSignature(artifacts, canvasLinks);
      if (signature === lastSavedSignatureRef.current) return;
      lastSavedSignatureRef.current = signature;
      void saveActiveSessionDocumentPatch({ artifacts, contextLinks: canvasLinks });
    };
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(flush, 200);
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeSessionId, artifacts, canvasLinks, saveActiveSessionDocumentPatch]);

  const createArtifact = React.useCallback((input: CreateArtifactInput) => {
    const now = new Date().toISOString();
    const artifact: SessionArtifact = {
      id: generateId("artifact"),
      artifactType: input.artifactType,
      semanticType: input.semanticType ?? null,
      blobRef: input.blobRef ?? null,
      byteSize: input.byteSize ?? null,
      title: input.title.trim() || "Untitled artifact",
      content: input.content,
      fileName: input.fileName?.trim() || null,
      language: input.language?.trim() || null,
      mimeType: input.mimeType?.trim() || null,
      position: input.position ?? null,
      promptStatus: input.artifactType === "prompt" ? "idle" : null,
      promptResult: null,
      promptError: null,
      promptRunId: null,
      promptModel: null,
      promptProvider: null,
      promptStartedAt: null,
      promptCompletedAt: null,
      sourceDataUrl: input.sourceDataUrl ?? null,
      syncMode: input.syncMode ?? "auto",
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };
    setArtifacts((current) => [artifact, ...current]);
    return artifact;
  }, []);

  const updateArtifact = React.useCallback(
    (
      artifactId: string,
      patch: ArtifactPatch,
      options: {
        revisionOrigin?: SessionArtifactRevisionOrigin;
        revisionAuthor?: "model" | "user";
        promptId?: string | null;
        responseId?: string | null;
      } = {},
    ) => {
      setArtifacts((current) =>
        current.map((artifact) => {
          if (artifact.id !== artifactId) return artifact;
          const normalizedPatch: ArtifactPatch = {
            ...patch,
            ...(patch.title !== undefined ? { title: patch.title.trim() || artifact.title } : {}),
            ...(patch.fileName !== undefined ? { fileName: patch.fileName?.trim() || null } : {}),
            ...(patch.language !== undefined ? { language: patch.language?.trim() || null } : {}),
            ...(patch.mimeType !== undefined ? { mimeType: patch.mimeType?.trim() || null } : {}),
          };
          const next = {
            ...artifact,
            ...normalizedPatch,
            updatedAt: new Date().toISOString(),
          };
          if (patch.content === undefined || patch.content === artifact.content) return next;
          return appendArtifactRevision(next, {
            id: generateId("revision"),
            content: patch.content,
            origin: options.revisionOrigin ?? "manual",
            author: options.revisionAuthor ?? "user",
            createdAt: next.updatedAt,
            promptId: options.promptId ?? null,
            responseId: options.responseId ?? null,
          });
        }),
      );
    },
    [],
  );

  const deleteArtifact = React.useCallback((artifactId: string) => {
    setArtifacts((current) => current.filter((artifact) => artifact.id !== artifactId));
    setCanvasLinks((current) =>
      current.filter(
        (link) =>
          link.artifactId !== artifactId &&
          link.promptId !== artifactId &&
          link.responseId !== artifactId,
      ),
    );
  }, []);

  const connectCanvasBlocks = React.useCallback(
    (source: SessionCanvasEndpoint, target: SessionCanvasEndpoint) => {
      const validation = validateSessionCanvasConnection({ source, target, links: canvasLinks });
      if (!validation.ok) return { ok: false as const, message: validation.message };
      const link: SessionCanvasLink = {
        ...validation.link,
        id: generateId("canvas-link"),
        createdAt: new Date().toISOString(),
      };
      setCanvasLinks((current) => [...current, link]);
      return { ok: true as const, link };
    },
    [canvasLinks],
  );

  const removeCanvasLink = React.useCallback((linkId: string) => {
    setCanvasLinks((current) => current.filter((link) => link.id !== linkId));
  }, []);

  const linkArtifactToTarget = React.useCallback(
    (artifactId: string, targetMessageId: string) => {
      const validation = validateSessionCanvasConnection({
        source: { id: artifactId, kind: "artifact" },
        target: { id: targetMessageId, kind: "prompt" },
        links: canvasLinks,
      });
      if (!validation.ok) return;
      setCanvasLinks((current) => [
        ...current,
        {
          ...validation.link,
          id: generateId("canvas-link"),
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [canvasLinks],
  );

  const unlinkArtifactFromTarget = React.useCallback((artifactId: string, targetMessageId: string) => {
    setCanvasLinks((current) =>
      current.filter(
        (link) =>
          !(
            link.relation === "context" &&
            link.artifactId === artifactId &&
            link.promptId === targetMessageId
          ),
      ),
    );
  }, []);

  const getArtifactsForTarget = React.useCallback(
    (targetMessageId: string) => selectArtifactsForTarget(artifacts, canvasLinks, targetMessageId),
    [artifacts, canvasLinks],
  );

  const isArtifactLinkedToTarget = React.useCallback(
    (artifactId: string, targetMessageId: string) =>
      canvasLinks.some(
        (link) =>
          link.relation === "context" &&
          link.artifactId === artifactId &&
          link.promptId === targetMessageId,
      ),
    [canvasLinks],
  );

  const setArtifactSyncMode = React.useCallback(
    (artifactId: string, syncMode: SessionArtifactSyncMode) => {
      setArtifacts((current) =>
        current.map((artifact) =>
          artifact.id === artifactId
            ? { ...artifact, syncMode, updatedAt: new Date().toISOString() }
            : artifact,
        ),
      );
    },
    [],
  );

  const restoreArtifactRevision = React.useCallback((artifactId: string, revisionId: string) => {
    setArtifacts((current) =>
      current.map((artifact) =>
        artifact.id === artifactId
          ? restoreRevision(artifact, revisionId, new Date().toISOString())
          : artifact,
      ),
    );
  }, []);

  const applyCompletedResponse = React.useCallback(
    (input: {
      promptId: string;
      responseId: string;
      sourcePromptId?: string | null;
      text: string;
      artifactIds?: string[];
    }) => {
      const result = applyResponseToArtifacts({
        artifacts: artifactsRef.current,
        links: canvasLinksRef.current,
        promptId: input.promptId,
        responseId: input.responseId,
        sourcePromptId: input.sourcePromptId ?? undefined,
        artifactIds: input.artifactIds,
        text: input.text,
        createdAt: new Date().toISOString(),
      });
      if (result.changed) {
        artifactsRef.current = result.artifacts;
        canvasLinksRef.current = result.links;
        setArtifacts(result.artifacts);
        setCanvasLinks(result.links);
      }
      return {
        capturedArtifactIds: result.capturedArtifactIds,
        skippedArtifactIds: result.skippedArtifactIds,
      };
    },
    [],
  );

  const value = React.useMemo<SessionArtifactsContextValue>(
    () => ({
      artifacts,
      canvasLinks,
      contextLinks,
      createArtifact,
      deleteArtifact,
      updateArtifact,
      getArtifactsForTarget,
      isArtifactLinkedToTarget,
      linkArtifactToTarget,
      unlinkArtifactFromTarget,
      connectCanvasBlocks,
      removeCanvasLink,
      setArtifactSyncMode,
      restoreArtifactRevision,
      applyCompletedResponse,
    }),
    [
      artifacts,
      canvasLinks,
      contextLinks,
      createArtifact,
      deleteArtifact,
      updateArtifact,
      getArtifactsForTarget,
      isArtifactLinkedToTarget,
      linkArtifactToTarget,
      unlinkArtifactFromTarget,
      connectCanvasBlocks,
      removeCanvasLink,
      setArtifactSyncMode,
      restoreArtifactRevision,
      applyCompletedResponse,
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
