import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  normalizeLlmSettingsState,
  type LlmSettingsState,
} from "@/lib/llm/user-settings";
import type { LlmSettingsRepository } from "@/lib/persistence/llm-settings-repository";

type StoredLlmSettings = {
  createdAt: string;
  ownerId: string;
  settings: LlmSettingsState;
  updatedAt: string;
};

const SETTINGS_FILE_EXTENSION = ".json";

export const getLlmSettingsStoreDir = () =>
  process.env.LLM_SETTINGS_STORE_DIR
    ? path.resolve(process.env.LLM_SETTINGS_STORE_DIR)
    : path.join(process.cwd(), "data", "llm-settings");

const getLlmSettingsFilePath = (ownerId: string) => {
  const digest = createHash("sha256").update(ownerId).digest("hex");
  return path.join(getLlmSettingsStoreDir(), `${digest}${SETTINGS_FILE_EXTENSION}`);
};

async function ensureLlmSettingsStoreDir() {
  await fs.mkdir(getLlmSettingsStoreDir(), { recursive: true });
}

async function writeStoredSettings(entry: StoredLlmSettings) {
  await ensureLlmSettingsStoreDir();
  const filePath = getLlmSettingsFilePath(entry.ownerId);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(entry, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readStoredSettings(ownerId: string): Promise<StoredLlmSettings | null> {
  try {
    const raw = await fs.readFile(getLlmSettingsFilePath(ownerId), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredLlmSettings>;
    return {
      createdAt:
        typeof parsed.createdAt === "string" && parsed.createdAt.length > 0
          ? parsed.createdAt
          : new Date().toISOString(),
      ownerId,
      settings: normalizeLlmSettingsState(parsed.settings),
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export const fileLlmSettingsRepository: LlmSettingsRepository = {
  async getSettings(ownerId) {
    const entry = await readStoredSettings(ownerId);
    return entry?.settings ?? null;
  },

  async saveSettings(ownerId, settings) {
    const existing = await readStoredSettings(ownerId);
    const now = new Date().toISOString();
    const next: StoredLlmSettings = {
      createdAt: existing?.createdAt ?? now,
      ownerId,
      settings: normalizeLlmSettingsState(settings),
      updatedAt: now,
    };
    await writeStoredSettings(next);
    return next.settings;
  },
};
