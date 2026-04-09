import { beforeEach, describe, expect, it, vi } from "vitest";

const getSettingsMock = vi.hoisted(() => vi.fn());
const saveSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/persistence/repositories", () => ({
  getLlmSettingsRepository: () => ({
    getSettings: getSettingsMock,
    saveSettings: saveSettingsMock,
  }),
}));

import { getLlmSettings } from "../lib/llm-settings-store";

describe("llm-settings-store", () => {
  beforeEach(() => {
    getSettingsMock.mockReset();
    saveSettingsMock.mockReset();
  });

  it("treats a missing llm_settings table as empty settings", async () => {
    getSettingsMock.mockRejectedValueOnce(
      new Error("Could not find the table 'public.llm_settings' in the schema cache"),
    );

    await expect(getLlmSettings("user-1")).resolves.toBeNull();
  });

  it("still throws unrelated repository errors", async () => {
    getSettingsMock.mockRejectedValueOnce(new Error("Supabase timeout"));

    await expect(getLlmSettings("user-1")).rejects.toThrow("Supabase timeout");
  });
});
