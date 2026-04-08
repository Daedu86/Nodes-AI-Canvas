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
    expect(getGraphModelLabel("openrouter/free", "openrouter")).toBe(
      "OpenRouter · Free Router",
    );
    expect(getGraphModelLabel("arcee-ai/trinity-large-preview:free", "openrouter")).toBe(
      "OpenRouter · Trinity Large Preview",
    );
  });

  it("assigns distinct graph swatches to supported free model families", () => {
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
    const router = getGraphModelPalette({
      ...defaults,
      model: "openrouter/free",
      provider: "openrouter",
    });

    expect(router.swatch).toBe("#2563eb");
    expect(router.swatch).toBe(nemotron.swatch);
  });
});
