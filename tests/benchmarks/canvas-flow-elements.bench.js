import { bench, describe } from "vitest";
import { buildCanvasFlowElements } from "../../components/assistant-ui/thread-graph-flow/canvas-flow-elements";
import {
  assertCanvasBenchmarkShape,
  createCanvasBenchmarkCase,
} from "./canvas-flow-benchmark-fixture";

const benchmarkCase = createCanvasBenchmarkCase();

describe("canvas flow builder", () => {
  bench(
    "1,000 messages, 300 artifacts/prompts, and 2,000 links",
    () => {
      const result = buildCanvasFlowElements(benchmarkCase.params);
      assertCanvasBenchmarkShape(result, benchmarkCase.expected);
    },
    {
      iterations: 5,
      warmupIterations: 1,
    },
  );
});
