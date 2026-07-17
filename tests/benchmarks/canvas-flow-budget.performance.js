import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { buildCanvasFlowElements } from "../../components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import {
  assertCanvasBenchmarkShape,
  createCanvasBenchmarkCase,
  DEFAULT_CANVAS_BENCHMARK_WORKLOAD,
} from "./canvas-flow-benchmark-fixture";

const DEFAULT_MAX_MEDIAN_MS = 150;
const DEFAULT_MAX_SCALE_RATIO = 8;
const SAMPLE_COUNT = 9;
const WARMUP_COUNT = 2;

const readPositiveNumber = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const measureBenchmarkCase = (benchmarkCase) => {
  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    const result = buildCanvasFlowElements(benchmarkCase.params);
    assertCanvasBenchmarkShape(result, benchmarkCase.expected);
  }

  const samples = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now();
    const result = buildCanvasFlowElements(benchmarkCase.params);
    samples.push(performance.now() - startedAt);
    assertCanvasBenchmarkShape(result, benchmarkCase.expected);
  }

  return {
    medianMs: median(samples),
    samplesMs: samples,
  };
};

const smallWorkload = {
  artifactCount: Math.ceil(DEFAULT_CANVAS_BENCHMARK_WORKLOAD.artifactCount / 4),
  contextLinkCount: Math.ceil(
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.contextLinkCount / 4,
  ),
  messageCount: Math.ceil(DEFAULT_CANVAS_BENCHMARK_WORKLOAD.messageCount / 4),
  outputLinkCount: Math.ceil(
    DEFAULT_CANVAS_BENCHMARK_WORKLOAD.outputLinkCount / 4,
  ),
  promptCount: Math.ceil(DEFAULT_CANVAS_BENCHMARK_WORKLOAD.promptCount / 4),
};

describe("canvas flow performance budget", () => {
  it(
    "keeps the large graph within absolute and scaling budgets",
    () => {
      const maxMedianMs = readPositiveNumber(
        "CANVAS_FLOW_MAX_MEDIAN_MS",
        DEFAULT_MAX_MEDIAN_MS,
      );
      const maxScaleRatio = readPositiveNumber(
        "CANVAS_FLOW_MAX_SCALE_RATIO",
        DEFAULT_MAX_SCALE_RATIO,
      );
      const small = measureBenchmarkCase(
        createCanvasBenchmarkCase(smallWorkload),
      );
      const large = measureBenchmarkCase(createCanvasBenchmarkCase());
      // Keep the denominator above the sub-millisecond timer noise floor while
      // retaining a meaningful comparison on fast runners.
      const scaleRatio = large.medianMs / Math.max(small.medianMs, 1);

      console.info(
        "[canvas-performance-budget]",
        JSON.stringify({
          budgets: {
            maxMedianMs,
            maxScaleRatio,
          },
          large,
          scaleRatio,
          small,
          workloads: {
            large: DEFAULT_CANVAS_BENCHMARK_WORKLOAD,
            small: smallWorkload,
          },
        }),
      );

      expect(large.medianMs).toBeLessThanOrEqual(maxMedianMs);
      expect(scaleRatio).toBeLessThanOrEqual(maxScaleRatio);
    },
    120_000,
  );
});
