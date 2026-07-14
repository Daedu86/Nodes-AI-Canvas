import {
  normalizeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import {
  fetchJson,
  normalizeClientError,
} from "@/lib/client/persisted-resource-client";

export type LlmSettingsPolicy = {
  openrouter: {
    hasDeploymentKey: boolean;
    requireUserKey: boolean;
  };
};

export type LlmSettingsSnapshot = {
  policy: LlmSettingsPolicy;
  settings: LlmSettingsState | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const parsePolicy = (value: unknown): LlmSettingsPolicy => {
  const policy = asRecord(value);
  const openrouter = asRecord(policy?.openrouter);
  return {
    openrouter: {
      hasDeploymentKey: Boolean(openrouter?.hasDeploymentKey),
      requireUserKey: Boolean(openrouter?.requireUserKey),
    },
  };
};

const parseSnapshot = (value: unknown, requireSettings: boolean): LlmSettingsSnapshot => {
  const payload = asRecord(value);
  if (!payload || !("settings" in payload)) {
    throw new Error("Invalid LLM settings response.");
  }

  if (payload.settings === null && !requireSettings) {
    return { policy: parsePolicy(payload.policy), settings: null };
  }
  if (!asRecord(payload.settings)) {
    throw new Error("Invalid LLM settings response.");
  }

  return {
    policy: parsePolicy(payload.policy),
    settings: normalizeLlmSettingsState(payload.settings as Partial<LlmSettingsState>),
  };
};

export async function fetchLlmSettings(): Promise<LlmSettingsSnapshot> {
  try {
    return parseSnapshot(await fetchJson<unknown>("/api/llm/settings"), false);
  } catch (error) {
    throw normalizeClientError(error, "Failed to load LLM settings");
  }
}

export async function persistLlmSettings(
  settings: LlmSettingsState,
): Promise<{ policy: LlmSettingsPolicy; settings: LlmSettingsState }> {
  try {
    const snapshot = parseSnapshot(
      await fetchJson<unknown>("/api/llm/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
      true,
    );
    if (!snapshot.settings) throw new Error("Invalid LLM settings response.");
    return { policy: snapshot.policy, settings: snapshot.settings };
  } catch (error) {
    throw normalizeClientError(error, "Failed to save LLM settings");
  }
}
