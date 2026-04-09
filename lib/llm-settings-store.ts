import { getLlmSettingsRepository } from "@/lib/persistence/repositories";
import { normalizeLlmSettingsState, type LlmSettingsState } from "@/lib/llm/user-settings";

export async function getLlmSettings(ownerId: string) {
  return getLlmSettingsRepository().getSettings(ownerId);
}

export async function saveLlmSettings(ownerId: string, settings: LlmSettingsState) {
  return getLlmSettingsRepository().saveSettings(
    ownerId,
    normalizeLlmSettingsState(settings),
  );
}
