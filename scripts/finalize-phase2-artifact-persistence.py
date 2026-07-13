from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:240]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/context/session-artifacts.tsx",
    '''type ArtifactPatch = Partial<
''',
    '''type ArtifactUpdateOptions = {
  revisionOrigin?: SessionArtifactRevisionOrigin;
  revisionAuthor?: "model" | "user";
  promptId?: string | null;
  responseId?: string | null;
};

type ArtifactPatch = Partial<
''',
)

replace_once(
    "components/context/session-artifacts.tsx",
    '''    options?: {
      revisionOrigin?: SessionArtifactRevisionOrigin;
      revisionAuthor?: "model" | "user";
      promptId?: string | null;
      responseId?: string | null;
    },
  ) => void;
''',
    '''    options?: ArtifactUpdateOptions,
  ) => void;
  updateArtifactAndPersist: (
    artifactId: string,
    patch: ArtifactPatch,
    options?: ArtifactUpdateOptions,
  ) => Promise<void>;
''',
)

replace_once(
    "components/context/session-artifacts.tsx",
    '''const stateSignature = (artifacts: SessionArtifact[], links: SessionCanvasLink[]) =>
  JSON.stringify({ artifacts, contextLinks: links });
''',
    '''const stateSignature = (artifacts: SessionArtifact[], links: SessionCanvasLink[]) =>
  JSON.stringify({ artifacts, contextLinks: links });

const patchArtifacts = (
  current: SessionArtifact[],
  artifactId: string,
  patch: ArtifactPatch,
  options: ArtifactUpdateOptions = {},
) =>
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
  });
''',
)

replace_once(
    "components/context/session-artifacts.tsx",
    '''  const updateArtifact = React.useCallback(
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
''',
    '''  const updateArtifact = React.useCallback(
    (
      artifactId: string,
      patch: ArtifactPatch,
      options: ArtifactUpdateOptions = {},
    ) => {
      const nextArtifacts = patchArtifacts(
        artifactsRef.current,
        artifactId,
        patch,
        options,
      );
      artifactsRef.current = nextArtifacts;
      setArtifacts(nextArtifacts);
    },
    [],
  );

  const updateArtifactAndPersist = React.useCallback(
    async (
      artifactId: string,
      patch: ArtifactPatch,
      options: ArtifactUpdateOptions = {},
    ) => {
      const nextArtifacts = patchArtifacts(
        artifactsRef.current,
        artifactId,
        patch,
        options,
      );
      const nextLinks = canvasLinksRef.current;
      artifactsRef.current = nextArtifacts;

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      if (!activeSessionId || hydratedSessionIdRef.current !== activeSessionId) {
        setArtifacts(nextArtifacts);
        return;
      }

      const signature = stateSignature(nextArtifacts, nextLinks);
      try {
        await saveActiveSessionDocumentPatch({
          artifacts: nextArtifacts,
          contextLinks: nextLinks,
        });
        lastSavedSignatureRef.current = signature;
      } catch {
        // Rendering the completed result remains safe; the normal debounce retries persistence.
      } finally {
        setArtifacts(nextArtifacts);
      }
    },
    [activeSessionId, saveActiveSessionDocumentPatch],
  );
''',
)

replace_once(
    "components/context/session-artifacts.tsx",
    '''      updateArtifact,
      getArtifactsForTarget,
''',
    '''      updateArtifact,
      updateArtifactAndPersist,
      getArtifactsForTarget,
''',
)

replace_once(
    "components/context/session-artifacts.tsx",
    '''      updateArtifact,
      getArtifactsForTarget,
''',
    '''      updateArtifact,
      updateArtifactAndPersist,
      getArtifactsForTarget,
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''type ApplyCompletedResponse = (input: {
''',
    '''type UpdateArtifactAndPersist = (
  artifactId: string,
  patch: ArtifactPatch,
  options?: {
    revisionOrigin?: SessionArtifactRevisionOrigin;
    revisionAuthor?: "model" | "user";
    promptId?: string | null;
    responseId?: string | null;
  },
) => Promise<void>;

type ApplyCompletedResponse = (input: {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  updateArtifact,
}: {
''',
    '''  updateArtifact,
  updateArtifactAndPersist,
}: {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  updateArtifact: UpdateArtifact;
}) {
''',
    '''  updateArtifact: UpdateArtifact;
  updateArtifactAndPersist: UpdateArtifactAndPersist;
}) {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  const updateArtifactRef = React.useRef(updateArtifact);
  const applyCompletedResponseRef = React.useRef(applyCompletedResponse);
''',
    '''  const updateArtifactRef = React.useRef(updateArtifact);
  const updateArtifactAndPersistRef = React.useRef(updateArtifactAndPersist);
  const applyCompletedResponseRef = React.useRef(applyCompletedResponse);
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''  React.useEffect(() => {
    updateArtifactRef.current = updateArtifact;
  }, [updateArtifact]);

  React.useEffect(() => {
''',
    '''  React.useEffect(() => {
    updateArtifactRef.current = updateArtifact;
  }, [updateArtifact]);

  React.useEffect(() => {
    updateArtifactAndPersistRef.current = updateArtifactAndPersist;
  }, [updateArtifactAndPersist]);

  React.useEffect(() => {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''        updateArtifactRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: null,
          promptModel: payload.modelId || spec.model,
          promptProvider: payload.provider || spec.provider,
          promptResult: text,
          promptRunId: spec.runId,
          promptStatus: "completed",
        });
''',
    '''        await updateArtifactAndPersistRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: null,
          promptModel: payload.modelId || spec.model,
          promptProvider: payload.provider || spec.provider,
          promptResult: text,
          promptRunId: spec.runId,
          promptStatus: "completed",
        });
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/use-canvas-run-manager.ts",
    '''        updateArtifactRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: aborted
            ? "Run cancelled."
            : error instanceof Error
              ? error.message
              : "Canvas run failed.",
          promptRunId: spec.runId,
          promptStatus: aborted ? "cancelled" : "failed",
        });
''',
    '''        await updateArtifactAndPersistRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: aborted
            ? "Run cancelled."
            : error instanceof Error
              ? error.message
              : "Canvas run failed.",
          promptRunId: spec.runId,
          promptStatus: aborted ? "cancelled" : "failed",
        });
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx",
    '''    applyCompletedResponse,
    connectCanvasBlocks,
''',
    '''    applyCompletedResponse,
    updateArtifactAndPersist,
    connectCanvasBlocks,
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx",
    '''    provider,
    updateArtifact,
  });
''',
    '''    provider,
    updateArtifact,
    updateArtifactAndPersist,
  });
''',
)
