import { type LlmSettingsState } from "@/lib/llm/user-settings";
import { BUILTIN_MODEL_OPTIONS, createDynamicModelOptions, dedupeModelOptions, type ModelOption } from "@/lib/model-options";

export const buildAvailableModelOptions = (settings: LlmSettingsState) => {
    const options: ModelOption[] = [];
    const enabledOpenRouterIds = new Set(settings.providers.openrouter.enabledModels);
    const deletedOpenRouterIds = new Set(settings.providers.openrouter.deletedModels ?? []);
    options.push(...BUILTIN_MODEL_OPTIONS.filter((option) => option.provider === "openrouter" &&
        enabledOpenRouterIds.has(option.modelId) &&
        !deletedOpenRouterIds.has(option.modelId)));
    if ((settings.providers.openrouter.customModels ?? []).length > 0) {
        options.push(...createDynamicModelOptions("openrouter", settings.providers.openrouter.customModels ?? []));
    }
    if (settings.providers.ollama.enabled) {
        options.push(...createDynamicModelOptions("ollama", settings.providers.ollama.models));
    }
    const deduped = dedupeModelOptions(options);
    return deduped.length > 0 ? deduped : BUILTIN_MODEL_OPTIONS;
};
