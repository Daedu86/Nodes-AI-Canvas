import { describe, expect, it } from "vitest";
import { buildAvailableModelOptions } from "@/components/context/llm-settings-model-options";
import { cloneDefaultLlmSettingsState } from "@/lib/llm/user-settings";
import { BUILTIN_MODEL_OPTIONS } from "@/lib/model-options";

describe("LLM settings model options", () => {
  it("adds enabled Ollama models to the available catalog", () => {
    const settings = cloneDefaultLlmSettingsState();
    settings.providers.ollama.enabled = true;
    settings.providers.ollama.models = ["llama3.2:latest"];

    expect(buildAvailableModelOptions(settings)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          modelId: "llama3.2:latest",
          provider: "ollama",
        }),
      ]),
    );
  });

  it("falls back to the built-in catalog when every configured model is removed", () => {
    const settings = cloneDefaultLlmSettingsState();
    settings.providers.openrouter.deletedModels = [
      ...settings.providers.openrouter.enabledModels,
    ];

    expect(buildAvailableModelOptions(settings)).toEqual(BUILTIN_MODEL_OPTIONS);
  });
});
