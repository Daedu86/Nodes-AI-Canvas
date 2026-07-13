
"use client";

import React from "react";
import {
  DEFAULT_CANVAS_RUN_CONCURRENCY,
  normalizeCanvasRunConcurrency,
  takeRunnableCanvasRuns,
  type CanvasRunQueueItem,
} from "@/lib/canvas-run-scheduler";
import {
  toLlmContextArtifacts,
  type SessionArtifact,
  type SessionArtifactRevisionOrigin,
  type SessionArtifactSemanticType,
  type SessionCanvasLink,
} from "@/lib/session-artifacts";
import type { ModelProvider } from "@/components/context/session-ui-state";

type ArtifactPatch = Partial<
  Pick<
    SessionArtifact,
    | "content"
    | "position"
    | "promptCompletedAt"
    | "promptError"
    | "promptModel"
    | "promptProvider"
    | "promptResult"
    | "promptRunId"
    | "promptStartedAt"
    | "promptStatus"
    | "title"
  >
>;

type UpdateArtifact = (
  artifactId: string,
  patch: ArtifactPatch,
  options?: {
    revisionOrigin?: SessionArtifactRevisionOrigin;
    revisionAuthor?: "model" | "user";
    promptId?: string | null;
    responseId?: string | null;
  },
) => void;

type UpdateArtifactAndPersist = (
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
  promptId: string;
  responseId: string;
  sourcePromptId?: string | null;
  text: string;
  artifactIds?: string[];
}) => { capturedArtifactIds: string[]; skippedArtifactIds: string[] };

type PendingCanvasRun = CanvasRunQueueItem & {
  contextArtifacts: ReturnType<typeof toLlmContextArtifacts>;
  model: string;
  outputArtifactTypes: Array<SessionArtifactSemanticType | null>;
  prompt: string;
  provider: ModelProvider;
};

type CanvasRunResponse = {
  error?: string;
  message?: string;
  modelId?: string;
  provider?: string;
  text?: string;
};

const makeRunId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `canvas-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const readErrorPayload = async (response: Response) => {
  try {
    const payload = (await response.json()) as CanvasRunResponse;
    return payload.error || payload.message || `Canvas run failed: ${response.status}`;
  } catch {
    return `Canvas run failed: ${response.status}`;
  }
};

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export function useCanvasRunManager({
  applyCompletedResponse,
  artifacts,
  canvasLinks,
  enabled,
  maxConcurrent = DEFAULT_CANVAS_RUN_CONCURRENCY,
  model,
  prompts,
  provider,
  updateArtifact,
  updateArtifactAndPersist,
}: {
  applyCompletedResponse: ApplyCompletedResponse;
  artifacts: SessionArtifact[];
  canvasLinks: SessionCanvasLink[];
  enabled: boolean;
  maxConcurrent?: number;
  model: string;
  prompts: SessionArtifact[];
  provider: ModelProvider;
  updateArtifact: UpdateArtifact;
  updateArtifactAndPersist?: UpdateArtifactAndPersist;
}) {
  const concurrency = normalizeCanvasRunConcurrency(maxConcurrent);
  const queueRef = React.useRef<PendingCanvasRun[]>([]);
  const activeRef = React.useRef(
    new Map<string, { controller: AbortController; spec: PendingCanvasRun }>(),
  );
  const promptIndexRef = React.useRef(new Map<string, SessionArtifact>());
  const artifactIndexRef = React.useRef(new Map<string, SessionArtifact>());
  const linksRef = React.useRef<SessionCanvasLink[]>(canvasLinks);
  const updateArtifactRef = React.useRef(updateArtifact);
  const updateArtifactAndPersistRef = React.useRef<UpdateArtifactAndPersist>(
    updateArtifactAndPersist ??
      (async (...args) => {
        updateArtifact(...args);
      }),
  );
  const applyCompletedResponseRef = React.useRef(applyCompletedResponse);
  const pumpRef = React.useRef<() => void>(() => {});
  const [counts, setCounts] = React.useState({ active: 0, queued: 0 });

  React.useEffect(() => {
    promptIndexRef.current = new Map(prompts.map((prompt) => [prompt.id, prompt] as const));
  }, [prompts]);

  React.useEffect(() => {
    artifactIndexRef.current = new Map(artifacts.map((artifact) => [artifact.id, artifact] as const));
  }, [artifacts]);

  React.useEffect(() => {
    linksRef.current = canvasLinks;
  }, [canvasLinks]);

  React.useEffect(() => {
    updateArtifactRef.current = updateArtifact;
  }, [updateArtifact]);

  React.useEffect(() => {
    updateArtifactAndPersistRef.current =
      updateArtifactAndPersist ??
      (async (...args) => {
        updateArtifact(...args);
      });
  }, [updateArtifact, updateArtifactAndPersist]);

  React.useEffect(() => {
    applyCompletedResponseRef.current = applyCompletedResponse;
  }, [applyCompletedResponse]);

  const syncCounts = React.useCallback(() => {
    setCounts({ active: activeRef.current.size, queued: queueRef.current.length });
  }, []);

  const executeRun = React.useCallback(
    async (spec: PendingCanvasRun) => {
      const controller = new AbortController();
      activeRef.current.set(spec.promptId, { controller, spec });
      updateArtifactRef.current(spec.promptId, {
        promptCompletedAt: null,
        promptError: null,
        promptModel: spec.model,
        promptProvider: spec.provider,
        promptResult: null,
        promptRunId: spec.runId,
        promptStartedAt: new Date().toISOString(),
        promptStatus: "running",
      });
      syncCounts();

      try {
        let response: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          response = await fetch("/api/canvas-runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contextArtifacts: spec.contextArtifacts,
              model: spec.model,
              outputArtifactTypes: spec.outputArtifactTypes,
              prompt: spec.prompt,
              promptId: spec.promptId,
              provider: spec.provider,
              runId: spec.runId,
            }),
            signal: controller.signal,
          });

          if (response.status !== 429 || attempt === 2) break;
          const retryAfter = Number(response.headers.get("Retry-After") || "1");
          await wait(Math.min(5, Math.max(1, retryAfter)) * 1000, controller.signal);
        }

        if (!response || !response.ok) {
          throw new Error(response ? await readErrorPayload(response) : "Canvas run failed.");
        }

        const payload = (await response.json()) as CanvasRunResponse;
        const text = payload.text?.trim() ?? "";
        if (!text) throw new Error("The model returned an empty canvas response.");

        applyCompletedResponseRef.current({
          artifactIds: spec.outputArtifactIds,
          promptId: spec.promptId,
          responseId: spec.runId,
          text,
        });
        await updateArtifactAndPersistRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: null,
          promptModel: payload.modelId || spec.model,
          promptProvider: payload.provider || spec.provider,
          promptResult: text,
          promptRunId: spec.runId,
          promptStatus: "completed",
        });
      } catch (error) {
        const aborted = controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        await updateArtifactAndPersistRef.current(spec.promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: aborted
            ? "Run cancelled."
            : error instanceof Error
              ? error.message
              : "Canvas run failed.",
          promptRunId: spec.runId,
          promptStatus: aborted ? "cancelled" : "failed",
        });
      } finally {
        activeRef.current.delete(spec.promptId);
        syncCounts();
        queueMicrotask(() => pumpRef.current());
      }
    },
    [syncCounts],
  );

  const pump = React.useCallback(() => {
    const activeOutputs = new Set<string>();
    activeRef.current.forEach(({ spec }) => {
      spec.outputArtifactIds.forEach((artifactId) => activeOutputs.add(artifactId));
    });
    const slots = concurrency - activeRef.current.size;
    const { remaining, runnable } = takeRunnableCanvasRuns({
      activeOutputArtifactIds: activeOutputs,
      queue: queueRef.current,
      slots,
    });
    queueRef.current = remaining;
    runnable.forEach((spec) => {
      void executeRun(spec);
    });
    syncCounts();
  }, [concurrency, executeRun, syncCounts]);

  React.useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const runPrompt = React.useCallback(
    (promptId: string) => {
      if (!enabled) return false;
      if (activeRef.current.has(promptId) || queueRef.current.some((item) => item.promptId === promptId)) {
        return false;
      }
      const prompt = promptIndexRef.current.get(promptId);
      const promptText = prompt?.content.trim() ?? "";
      if (!prompt || prompt.artifactType !== "prompt" || !promptText) return false;

      const inputArtifactIds = linksRef.current
        .filter((link) => link.relation === "context" && link.promptId === promptId)
        .map((link) => link.artifactId);
      const outputArtifactIds = linksRef.current
        .filter((link) => link.relation === "output" && link.promptId === promptId)
        .map((link) => link.artifactId);
      const inputArtifacts = inputArtifactIds.flatMap((artifactId) => {
        const artifact = artifactIndexRef.current.get(artifactId);
        return artifact ? [artifact] : [];
      });
      const outputArtifactTypes = outputArtifactIds.map(
        (artifactId) => artifactIndexRef.current.get(artifactId)?.semanticType ?? null,
      );
      const spec: PendingCanvasRun = {
        contextArtifacts: toLlmContextArtifacts(inputArtifacts),
        model,
        outputArtifactIds: [...new Set(outputArtifactIds)],
        outputArtifactTypes,
        prompt: promptText,
        promptId,
        provider,
        runId: makeRunId(),
      };

      queueRef.current.push(spec);
      updateArtifactRef.current(promptId, {
        promptCompletedAt: null,
        promptError: null,
        promptModel: model,
        promptProvider: provider,
        promptResult: null,
        promptRunId: spec.runId,
        promptStartedAt: null,
        promptStatus: "queued",
      });
      syncCounts();
      queueMicrotask(() => pumpRef.current());
      return true;
    },
    [enabled, model, provider, syncCounts],
  );

  const cancelPrompt = React.useCallback(
    (promptId: string) => {
      const queued = queueRef.current.some((item) => item.promptId === promptId);
      if (queued) {
        queueRef.current = queueRef.current.filter((item) => item.promptId !== promptId);
        updateArtifactRef.current(promptId, {
          promptCompletedAt: new Date().toISOString(),
          promptError: "Run cancelled before it started.",
          promptStatus: "cancelled",
        });
        syncCounts();
      }
      const active = activeRef.current.get(promptId);
      if (active) active.controller.abort();
      return queued || Boolean(active);
    },
    [syncCounts],
  );

  const cancelAll = React.useCallback(() => {
    const queuedPromptIds = queueRef.current.map((item) => item.promptId);
    queueRef.current = [];
    queuedPromptIds.forEach((promptId) => {
      updateArtifactRef.current(promptId, {
        promptCompletedAt: new Date().toISOString(),
        promptError: "Run cancelled before it started.",
        promptStatus: "cancelled",
      });
    });
    activeRef.current.forEach(({ controller }) => controller.abort());
    syncCounts();
  }, [syncCounts]);

  const promptIdsKey = React.useMemo(
    () => prompts.map((prompt) => prompt.id).join("|"),
    [prompts],
  );

  React.useEffect(() => {
    prompts.forEach((prompt) => {
      if (prompt.promptStatus === "running" || prompt.promptStatus === "queued") {
        updateArtifactRef.current(prompt.id, {
          promptCompletedAt: new Date().toISOString(),
          promptError: "The previous run was interrupted by a reload or session change.",
          promptStatus: "cancelled",
        });
      }
    });
    // Only reconcile persisted in-flight states when the prompt set changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptIdsKey]);

  React.useEffect(
    () => () => {
      activeRef.current.forEach(({ controller }) => controller.abort());
      activeRef.current.clear();
      queueRef.current = [];
    },
    [],
  );

  return {
    activeCount: counts.active,
    cancelAll,
    cancelPrompt,
    queuedCount: counts.queued,
    runPrompt,
  };
}
