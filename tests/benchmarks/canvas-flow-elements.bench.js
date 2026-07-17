import { bench, describe } from "vitest";
import { buildCanvasFlowElements } from "../../components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import {
  assertCanvasBenchmarkShape,
  CANVAS_BENCHMARK_NODE_WORKLOADS,
  createCanvasBenchmarkCase,
} from "./canvas-flow-benchmark-fixture";

describe("canvas flow builder", () => {
  for (const { nodeCount, workload } of CANVAS_BENCHMARK_NODE_WORKLOADS) {
    const benchmarkCase = createCanvasBenchmarkCase(workload);
    bench(
      `${nodeCount} nodes and ${benchmarkCase.expected.edges} edges`,
      () => {
        const result = buildCanvasFlowElements(benchmarkCase.params);
        assertCanvasBenchmarkShape(result, benchmarkCase.expected);
      },
      {
        iterations: 7,
        warmupIterations: 7,
        warmupTime: 500,
      },
    );
  }
});
