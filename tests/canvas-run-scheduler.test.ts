
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANVAS_RUN_CONCURRENCY,
  normalizeCanvasRunConcurrency,
  takeRunnableCanvasRuns,
} from "../lib/canvas-run-scheduler";

describe("canvas run scheduler", () => {
  it("starts independent prompts in parallel up to the free-tier concurrency limit", () => {
    const queue = [
      { promptId: "a", runId: "run-a", outputArtifactIds: ["out-a"] },
      { promptId: "b", runId: "run-b", outputArtifactIds: ["out-b"] },
      { promptId: "c", runId: "run-c", outputArtifactIds: ["out-c"] },
      { promptId: "d", runId: "run-d", outputArtifactIds: ["out-d"] },
    ];
    const result = takeRunnableCanvasRuns({
      activeOutputArtifactIds: new Set<string>(),
      queue,
      slots: DEFAULT_CANVAS_RUN_CONCURRENCY,
    });
    expect(result.runnable.map((item) => item.promptId)).toEqual(["a", "b", "c"]);
    expect(result.remaining.map((item) => item.promptId)).toEqual(["d"]);
  });

  it("queues prompts that would write to an output already in use", () => {
    const result = takeRunnableCanvasRuns({
      activeOutputArtifactIds: new Set(["shared"]),
      queue: [
        { promptId: "blocked", runId: "run-blocked", outputArtifactIds: ["shared"] },
        { promptId: "free", runId: "run-free", outputArtifactIds: ["other"] },
      ],
      slots: 2,
    });
    expect(result.runnable.map((item) => item.promptId)).toEqual(["free"]);
    expect(result.remaining.map((item) => item.promptId)).toEqual(["blocked"]);
  });

  it("normalizes invalid concurrency values", () => {
    expect(normalizeCanvasRunConcurrency(0)).toBe(DEFAULT_CANVAS_RUN_CONCURRENCY);
    expect(normalizeCanvasRunConcurrency(2.9)).toBe(2);
  });
});
