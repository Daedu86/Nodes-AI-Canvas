import { describe, expect, it } from "vitest";
import { evaluateBundleBudget } from "../scripts/check-bundle-budget.mjs";

describe("evaluateBundleBudget", () => {
  it("accepts assets inside both budgets and reports the largest chunk", () => {
    const result = evaluateBundleBudget(
      [
        { gzipBytes: 120, path: "small.js", rawBytes: 300 },
        { gzipBytes: 240, path: "large.js", rawBytes: 700 },
      ],
      { maxSingleGzipBytes: 300, maxTotalGzipBytes: 500 },
    );

    expect(result.largest?.path).toBe("large.js");
    expect(result.totalGzipBytes).toBe(360);
    expect(result.violations).toEqual([]);
  });

  it("reports single-chunk and total-size violations independently", () => {
    const result = evaluateBundleBudget(
      [
        { gzipBytes: 350, path: "large.js", rawBytes: 900 },
        { gzipBytes: 200, path: "other.js", rawBytes: 500 },
      ],
      { maxSingleGzipBytes: 300, maxTotalGzipBytes: 500 },
    );

    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toContain("large.js");
    expect(result.violations[1]).toContain("Total JavaScript");
  });
});
