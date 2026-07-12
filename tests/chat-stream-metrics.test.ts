import { describe, expect, it } from "vitest";
import {
  createLlmStreamTimingTracker,
  isLlmTokenChunk,
} from "../lib/server/chat/stream-metrics";

describe("LLM stream timing metrics", () => {
  it("recognizes textual and reasoning deltas without treating metadata as a token", () => {
    expect(isLlmTokenChunk({ chunk: { type: "text-delta", text: "Hello" } })).toBe(true);
    expect(
      isLlmTokenChunk({ chunk: { type: "reasoning-delta", textDelta: "Think" } }),
    ).toBe(true);
    expect(isLlmTokenChunk({ chunk: { type: "text-delta", text: "" } })).toBe(false);
    expect(isLlmTokenChunk({ chunk: { type: "tool-call" } })).toBe(false);
  });

  it("records end-to-end and provider-relative first chunk and token timings", () => {
    const clock = [1_120, 1_180, 1_250];
    const tracker = createLlmStreamTimingTracker({
      attemptStartedAt: 1_100,
      now: () => clock.shift() ?? 1_250,
      requestStartedAt: 1_000,
    });

    const metadata = tracker.observe({ chunk: { type: "tool-call" } });
    expect(metadata.firstTokenObserved).toBe(false);
    expect(metadata.snapshot).toMatchObject({
      providerTimeToFirstChunkMs: 20,
      timeToFirstChunkMs: 120,
      timeToFirstTokenMs: null,
    });

    const token = tracker.observe({ chunk: { type: "text-delta", text: "A" } });
    expect(token.firstTokenObserved).toBe(true);
    expect(token.snapshot).toMatchObject({
      providerTimeToFirstTokenMs: 80,
      timeToFirstTokenMs: 180,
    });

    const final = tracker.snapshot();
    expect(final).toEqual({
      durationMs: 250,
      providerDurationMs: 150,
      providerTimeToFirstChunkMs: 20,
      providerTimeToFirstTokenMs: 80,
      timeToFirstChunkMs: 120,
      timeToFirstTokenMs: 180,
    });
  });
});
