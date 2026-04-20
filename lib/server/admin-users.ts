import { promises as fs } from "node:fs";
import path from "node:path";
import { getPersistenceBackend } from "@/lib/persistence/backend";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { getChatQuotaLimits, normalizeUserPlan, type UserPlan } from "@/lib/user-plan";
import { normalizeLlmSettingsState, type LlmSettingsState } from "@/lib/llm/user-settings";
import { normalizeChatUsageSnapshot, type ChatUsageSnapshot } from "@/lib/chat-usage";
import { saveUserPlan } from "@/lib/user-plan-store";
import { getSessionStoreDir } from "@/lib/persistence/file/file-session-repository";
import { getProjectStoreDir } from "@/lib/persistence/file/file-project-repository";
import { getLlmSettingsStoreDir } from "@/lib/persistence/file/file-llm-settings-repository";
import { getUserPlanStoreDir } from "@/lib/persistence/file/file-user-plan-repository";
import { getChatUsageStoreDir } from "@/lib/persistence/file/file-chat-usage-repository";

export type AdminUserSummary = {
  counts: {
    agentTokens: number;
    projects: number;
    sessions: number;
  };
  createdAt: string | null;
  lastActivityAt: string | null;
  limits: ReturnType<typeof getChatQuotaLimits>;
  ownerId: string;
  plan: UserPlan;
  providers: {
    ollamaKeyCount: number;
    openrouterKeyCount: number;
  };
  usage: ChatUsageSnapshot;
};

type MutableSummary = {
  counts: AdminUserSummary["counts"];
  createdAt: string | null;
  lastActivityAt: string | null;
  ownerId: string;
  plan: UserPlan;
  providers: AdminUserSummary["providers"];
  usage: ChatUsageSnapshot | null;
};

const ensureSummary = (map: Map<string, MutableSummary>, ownerId: string) => {
  const existing = map.get(ownerId);
  if (existing) {
    return existing;
  }
  const next: MutableSummary = {
    counts: {
      agentTokens: 0,
      projects: 0,
      sessions: 0,
    },
    createdAt: null,
    lastActivityAt: null,
    ownerId,
    plan: "free",
    providers: {
      ollamaKeyCount: 0,
      openrouterKeyCount: 0,
    },
    usage: null,
  };
  map.set(ownerId, next);
  return next;
};

const updateDates = (summary: MutableSummary, createdAt?: string | null, updatedAt?: string | null) => {
  if (createdAt) {
    summary.createdAt =
      !summary.createdAt || createdAt < summary.createdAt ? createdAt : summary.createdAt;
  }
  if (updatedAt) {
    summary.lastActivityAt =
      !summary.lastActivityAt || updatedAt > summary.lastActivityAt ? updatedAt : summary.lastActivityAt;
  }
};

const finalizeSummaries = (map: Map<string, MutableSummary>) =>
  [...map.values()]
    .map<AdminUserSummary>((summary) => ({
      counts: summary.counts,
      createdAt: summary.createdAt,
      lastActivityAt: summary.lastActivityAt,
      limits: getChatQuotaLimits(summary.plan),
      ownerId: summary.ownerId,
      plan: summary.plan,
      providers: summary.providers,
      usage: normalizeChatUsageSnapshot(summary.usage, Date.now()),
    }))
    .sort((a, b) => {
      const activityA = a.lastActivityAt ?? a.createdAt ?? "";
      const activityB = b.lastActivityAt ?? b.createdAt ?? "";
      if (activityA !== activityB) {
        return activityB.localeCompare(activityA);
      }
      return a.ownerId.localeCompare(b.ownerId);
    });

const readJsonDir = async <T extends { ownerId?: string | null }>(dir: string) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name));
    const records = await Promise.all(
      jsonFiles.map(async (filePath) => {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw) as T;
      }),
    );
    return records;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [] as T[];
    }
    throw error;
  }
};

const readFileBackendUsers = async () => {
  const summaries = new Map<string, MutableSummary>();

  const sessions = await readJsonDir<{
    ownerId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>(getSessionStoreDir());
  for (const session of sessions) {
    if (!session.ownerId) continue;
    const summary = ensureSummary(summaries, session.ownerId);
    summary.counts.sessions += 1;
    updateDates(summary, session.createdAt ?? null, session.updatedAt ?? session.createdAt ?? null);
  }

  const projects = await readJsonDir<{
    ownerId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>(getProjectStoreDir());
  for (const project of projects) {
    if (!project.ownerId) continue;
    const summary = ensureSummary(summaries, project.ownerId);
    summary.counts.projects += 1;
    updateDates(summary, project.createdAt ?? null, project.updatedAt ?? project.createdAt ?? null);
  }

  const planRecords = await readJsonDir<{
    ownerId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    plan?: string;
  }>(getUserPlanStoreDir());
  for (const record of planRecords) {
    if (!record.ownerId) continue;
    const summary = ensureSummary(summaries, record.ownerId);
    summary.plan = normalizeUserPlan(record.plan);
    updateDates(summary, record.createdAt ?? null, record.updatedAt ?? record.createdAt ?? null);
  }

  const llmSettings = await readJsonDir<{
    ownerId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    settings?: Partial<LlmSettingsState>;
  }>(getLlmSettingsStoreDir());
  for (const record of llmSettings) {
    if (!record.ownerId) continue;
    const summary = ensureSummary(summaries, record.ownerId);
    const settings = normalizeLlmSettingsState(record.settings);
    summary.providers.openrouterKeyCount = settings.providers.openrouter.apiKeys?.length ?? 0;
    summary.providers.ollamaKeyCount = settings.providers.ollama.apiKeys?.length ?? 0;
    updateDates(summary, record.createdAt ?? null, record.updatedAt ?? record.createdAt ?? null);
  }

  const chatUsage = await readJsonDir<{
    ownerId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    snapshot?: {
      dayCount?: number;
      dayWindowStart?: string;
      hourCount?: number;
      hourWindowStart?: string;
      minuteCount?: number;
      minuteWindowStart?: string;
    };
  }>(getChatUsageStoreDir());
  for (const record of chatUsage) {
    if (!record.ownerId) continue;
    const summary = ensureSummary(summaries, record.ownerId);
    summary.usage = normalizeChatUsageSnapshot(
      record.snapshot
        ? {
            dayCount: Number(record.snapshot.dayCount ?? 0),
            dayWindowStart: Date.parse(record.snapshot.dayWindowStart ?? ""),
            hourCount: Number(record.snapshot.hourCount ?? 0),
            hourWindowStart: Date.parse(record.snapshot.hourWindowStart ?? ""),
            minuteCount: Number(record.snapshot.minuteCount ?? 0),
            minuteWindowStart: Date.parse(record.snapshot.minuteWindowStart ?? ""),
          }
        : null,
      Date.now(),
    );
    updateDates(summary, record.createdAt ?? null, record.updatedAt ?? record.createdAt ?? null);
  }

  const agentWorkDir = process.env.AGENT_WORK_STORE_DIR
    ? path.resolve(process.env.AGENT_WORK_STORE_DIR)
    : path.join(process.cwd(), "data", "agent-work");
  try {
    const ownerDirs = await fs.readdir(agentWorkDir, { withFileTypes: true });
    for (const entry of ownerDirs) {
      if (!entry.isDirectory()) continue;
      const ownerId = entry.name;
      const summary = ensureSummary(summaries, ownerId);
      const tokenDir = path.join(agentWorkDir, ownerId, "tokens");
      try {
        const tokenEntries = await fs.readdir(tokenDir, { withFileTypes: true });
        summary.counts.agentTokens += tokenEntries.filter(
          (tokenEntry) => tokenEntry.isFile() && tokenEntry.name.endsWith(".json"),
        ).length;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return finalizeSummaries(summaries);
};

const readSupabaseBackendUsers = async () => {
  const client = getSupabasePersistenceClient();
  const summaries = new Map<string, MutableSummary>();

  const [
    sessionResult,
    projectResult,
    planResult,
    llmSettingsResult,
    usageResult,
    tokenResult,
  ] = await Promise.all([
    client.from("sessions").select("owner_id,created_at,updated_at"),
    client.from("projects").select("owner_id,created_at,updated_at"),
    client.from("user_plans").select("owner_id,plan,created_at,updated_at"),
    client.from("llm_settings").select("owner_id,settings_json,created_at,updated_at"),
    client
      .from("chat_usage_state")
      .select(
        "owner_id,minute_window_start,minute_count,hour_window_start,hour_count,day_window_start,day_count,created_at,updated_at",
      ),
    client.from("agent_tokens").select("owner_id,created_at"),
  ]);

  for (const result of [
    sessionResult,
    projectResult,
    planResult,
    llmSettingsResult,
    usageResult,
    tokenResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message || "Failed to load admin users");
    }
  }

  for (const row of sessionResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    summary.counts.sessions += 1;
    updateDates(summary, row.created_at, row.updated_at);
  }

  for (const row of projectResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    summary.counts.projects += 1;
    updateDates(summary, row.created_at, row.updated_at);
  }

  for (const row of planResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    summary.plan = normalizeUserPlan(row.plan);
    updateDates(summary, row.created_at, row.updated_at);
  }

  for (const row of llmSettingsResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    const settings = normalizeLlmSettingsState(row.settings_json as Partial<LlmSettingsState>);
    summary.providers.openrouterKeyCount = settings.providers.openrouter.apiKeys?.length ?? 0;
    summary.providers.ollamaKeyCount = settings.providers.ollama.apiKeys?.length ?? 0;
    updateDates(summary, row.created_at, row.updated_at);
  }

  for (const row of usageResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    summary.usage = normalizeChatUsageSnapshot(
      {
        dayCount: row.day_count,
        dayWindowStart: Date.parse(row.day_window_start),
        hourCount: row.hour_count,
        hourWindowStart: Date.parse(row.hour_window_start),
        minuteCount: row.minute_count,
        minuteWindowStart: Date.parse(row.minute_window_start),
      },
      Date.now(),
    );
    updateDates(summary, row.created_at, row.updated_at);
  }

  for (const row of tokenResult.data ?? []) {
    if (!row.owner_id) continue;
    const summary = ensureSummary(summaries, row.owner_id);
    summary.counts.agentTokens += 1;
    updateDates(summary, row.created_at, row.created_at);
  }

  return finalizeSummaries(summaries);
};

export async function listAdminUsers() {
  return getPersistenceBackend() === "supabase"
    ? readSupabaseBackendUsers()
    : readFileBackendUsers();
}

export async function updateAdminUserPlan(ownerId: string, plan: UserPlan) {
  await saveUserPlan(ownerId, plan);
  const users = await listAdminUsers();
  return users.find((entry) => entry.ownerId === ownerId) ?? null;
}
