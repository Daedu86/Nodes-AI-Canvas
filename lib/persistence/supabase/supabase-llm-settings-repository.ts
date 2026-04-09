import {
  normalizeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import type { LlmSettingsRepository } from "@/lib/persistence/llm-settings-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { ensureData, requireOwnerId } from "@/lib/persistence/supabase/shared";

type LlmSettingsRow = {
  owner_id: string;
  settings_json: unknown;
};

const toLlmSettingsFromRow = (row: LlmSettingsRow): LlmSettingsState =>
  normalizeLlmSettingsState(row.settings_json as Partial<LlmSettingsState>);

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
    const { data, error } = await client
      .from("llm_settings")
      .upsert(
        {
          owner_id: requireOwnerId(ownerId),
          settings_json: normalizeLlmSettingsState(settings),
        },
        { onConflict: "owner_id" },
      )
      .select("owner_id,settings_json")
      .single();

    const row = ensureData(data as LlmSettingsRow | null, error, "Failed to save LLM settings");
    return toLlmSettingsFromRow(row);
  },
};
