
export const DEFAULT_CANVAS_RUN_CONCURRENCY = 3;

export type CanvasRunQueueItem = {
  promptId: string;
  runId: string;
  outputArtifactIds: string[];
};

export const normalizeCanvasRunConcurrency = (
  value: number | null | undefined,
  fallback = DEFAULT_CANVAS_RUN_CONCURRENCY,
) => {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.max(1, Math.floor(value));
};

export const hasCanvasRunOutputConflict = (
  activeOutputArtifactIds: ReadonlySet<string>,
  outputArtifactIds: readonly string[],
) => outputArtifactIds.some((artifactId) => activeOutputArtifactIds.has(artifactId));

export const takeRunnableCanvasRuns = <T extends CanvasRunQueueItem>({
  activeOutputArtifactIds,
  queue,
  slots,
}: {
  activeOutputArtifactIds: ReadonlySet<string>;
  queue: readonly T[];
  slots: number;
}) => {
  const availableSlots = Math.max(0, Math.floor(slots));
  if (availableSlots === 0 || queue.length === 0) {
    return { remaining: [...queue], runnable: [] as T[] };
  }

  const reservedOutputs = new Set(activeOutputArtifactIds);
  const runnable: T[] = [];
  const remaining: T[] = [];

  queue.forEach((item) => {
    const conflict = hasCanvasRunOutputConflict(reservedOutputs, item.outputArtifactIds);
    if (runnable.length < availableSlots && !conflict) {
      runnable.push(item);
      item.outputArtifactIds.forEach((artifactId) => reservedOutputs.add(artifactId));
      return;
    }
    remaining.push(item);
  });

  return { remaining, runnable };
};
