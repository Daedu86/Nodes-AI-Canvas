import type { LlmSettingsState } from "@/lib/llm/user-settings";

export interface LlmSettingsRepository {
  getSettings(ownerId: string): Promise<LlmSettingsState | null>;
  saveSettings(ownerId: string, settings: LlmSettingsState): Promise<LlmSettingsState>;
}
