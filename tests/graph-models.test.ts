import { describe, expect, it } from "vitest";
import {
  getGraphModelLabel,
  getGraphModelPalette,
} from "../components/assistant-ui/thread-graph/graph-models";

describe("graph model styling", () => {
  it("labels supported free OpenRouter models with friendly names", () => {
    expect(
      getGraphModelLabel("nvidia/nemotron-3-super-120b-a12b:free", "openrouter"),
    ).toBe("OpenRouter · Nemotron 3 Super");
    expect(getGraphModelLabel("stepfun/step-3.5-flash:free", "openrouter")).toBe(
      "OpenRouter · Step 3.5 Flash",
    );
  });

  it("assigns a distinct graph swatch to StepFun free responses", () => {
    const defaults = {
      defaultFill: "rgba(255,255,255,0.94)",
      defaultStroke: "rgba(15,23,42,0.08)",
      isDarkBg: false,
    } as const;

    const nemotron = getGraphModelPalette({
      ...defaults,
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      provider: "openrouter",
    });
    const stepfun = getGraphModelPalette({
      ...defaults,
      model: "stepfun/step-3.5-flash:free",
      provider: "openrouter",
    });

    expect(stepfun.swatch).toBe("#0d9488");
    expect(stepfun.swatch).not.toBe(nemotron.swatch);
  });
});
