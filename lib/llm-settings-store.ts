import { getLlmSettingsRepository } from "@/lib/persistence/repositories";
import {
  stripLlmSettingsCredentialMetadata,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";

const isMissingLlmSettingsStorageError = (error: unknown) =>
  error instanceof Error &&
  /llm_settings/i.test(error.message) &&
  /(schema cache|could not find the table|relation)/i.test(error.message);

export async function getLlmSettings(ownerId: string) {
  try {
    return await getLlmSettingsRepository().getSettings(ownerId);
  } catch (error) {
    if (isMissingLlmSettingsStorageError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveLlmSettings(ownerId: string, settings: LlmSettingsState) {
  return getLlmSettingsRepository().saveSettings(
    ownerId,
    stripLlmSettingsCredentialMetadata(settings),
  );
}
