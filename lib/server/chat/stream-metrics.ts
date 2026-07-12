type StreamTimingSnapshot = {
  durationMs: number;
  providerDurationMs: number;
  providerTimeToFirstChunkMs: number | null;
  providerTimeToFirstTokenMs: number | null;
  timeToFirstChunkMs: number | null;
  timeToFirstTokenMs: number | null;
};

type StreamTimingTrackerOptions = {
  attemptStartedAt: number;
  now?: () => number;
  requestStartedAt: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getStreamChunk = (event: unknown) => {
  const record = asRecord(event);
  return record && "chunk" in record ? record.chunk : event;
};

export const isLlmTokenChunk = (event: unknown) => {
  const chunk = asRecord(getStreamChunk(event));
  if (!chunk) return false;
  if (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta") {
    return false;
  }
  const text =
    typeof chunk.text === "string"
      ? chunk.text
      : typeof chunk.textDelta === "string"
        ? chunk.textDelta
        : "";
  return text.length > 0;
};

export function createLlmStreamTimingTracker({
  attemptStartedAt,
  now = Date.now,
  requestStartedAt,
}: StreamTimingTrackerOptions) {
  let firstChunkAt: number | null = null;
  let firstTokenAt: number | null = null;

  const snapshot = (observedAt = now()): StreamTimingSnapshot => ({
    durationMs: Math.max(0, observedAt - requestStartedAt),
    providerDurationMs: Math.max(0, observedAt - attemptStartedAt),
    providerTimeToFirstChunkMs:
      firstChunkAt === null ? null : Math.max(0, firstChunkAt - attemptStartedAt),
    providerTimeToFirstTokenMs:
      firstTokenAt === null ? null : Math.max(0, firstTokenAt - attemptStartedAt),
    timeToFirstChunkMs:
      firstChunkAt === null ? null : Math.max(0, firstChunkAt - requestStartedAt),
    timeToFirstTokenMs:
      firstTokenAt === null ? null : Math.max(0, firstTokenAt - requestStartedAt),
  });

  return {
    observe(event: unknown) {
      const observedAt = now();
      if (firstChunkAt === null) firstChunkAt = observedAt;
      const firstTokenObserved = firstTokenAt === null && isLlmTokenChunk(event);
      if (firstTokenObserved) firstTokenAt = observedAt;
      return {
        firstTokenObserved,
        snapshot: snapshot(observedAt),
      };
    },
    snapshot,
  };
}

export type LlmStreamTimingSnapshot = StreamTimingSnapshot;
