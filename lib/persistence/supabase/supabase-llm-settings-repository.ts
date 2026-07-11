import {
  normalizeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import type { LlmSettingsRepository } from "@/lib/persistence/llm-settings-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { ensureData, requireOwnerId } from "@/lib/persistence/supabase/shared";
import {
  decryptLlmSettingsCredentials,
  encryptLlmSettingsCredentials,
} from "@/lib/server/llm-settings-encryption";

type LlmSettingsRow = {
  owner_id: string;
  settings_json: unknown;
};

const toLlmSettingsFromRow = (row: LlmSettingsRow): LlmSettingsState => {
  const decoded = decryptLlmSettingsCredentials(row.owner_id, row.settings_json);
  return normalizeLlmSettingsState(
    decoded.settings as Partial<LlmSettingsState> | null | undefined,
  );
};

export const supabaseLlmSettingsRepository: LlmSettingsRepository = {
  async getSettings(ownerId) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("llm_settings")
      .select("owner_id,settings_json")
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load LLM settings");
    }
    if (!data) {
      return null;
    }
    return toLlmSettingsFromRow(data as LlmSettingsRow);
  },

  async saveSettings(ownerId, settings) {
    const client = getSupabasePersistenceClient();
    const normalized = normalizeLlmSettingsState(settings);
    const { data, error } = await client
      .from("llm_settings")
      .upsert(
        {
          owner_id: requireOwnerId(ownerId),
          settings_json: encryptLlmSettingsCredentials(ownerId, normalized),
        },
        { onConflict: "owner_id" },
      )
      .select("owner_id,settings_json")
      .single();

    const row = ensureData(data as LlmSettingsRow | null, error, "Failed to save LLM settings");
    return toLlmSettingsFromRow(row);
  },
};
