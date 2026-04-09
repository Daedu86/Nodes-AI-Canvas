import { getPersistenceBackend } from "@/lib/persistence/backend";
import { fileMemoryRepository } from "@/lib/persistence/file/file-memory-repository";
import { fileLlmSettingsRepository } from "@/lib/persistence/file/file-llm-settings-repository";
import { fileProjectRepository } from "@/lib/persistence/file/file-project-repository";
import { fileSessionRepository } from "@/lib/persistence/file/file-session-repository";
import type { LlmSettingsRepository } from "@/lib/persistence/llm-settings-repository";
import type { MemoryRepository } from "@/lib/persistence/memory-repository";
import type { ProjectRepository } from "@/lib/persistence/project-repository";
import type { SessionRepository } from "@/lib/persistence/session-repository";
import { supabaseLlmSettingsRepository } from "@/lib/persistence/supabase/supabase-llm-settings-repository";
import { supabaseMemoryRepository } from "@/lib/persistence/supabase/supabase-memory-repository";
import { supabaseProjectRepository } from "@/lib/persistence/supabase/supabase-project-repository";
import { supabaseSessionRepository } from "@/lib/persistence/supabase/supabase-session-repository";

export function getSessionRepository(): SessionRepository {
  return getPersistenceBackend() === "supabase"
    ? supabaseSessionRepository
    : fileSessionRepository;
}

export function getProjectRepository(): ProjectRepository {
  return getPersistenceBackend() === "supabase"
    ? supabaseProjectRepository
    : fileProjectRepository;
}

export function getMemoryRepository(): MemoryRepository {
  return getPersistenceBackend() === "supabase"
    ? supabaseMemoryRepository
    : fileMemoryRepository;
}

export function getLlmSettingsRepository(): LlmSettingsRepository {
  return getPersistenceBackend() === "supabase"
    ? supabaseLlmSettingsRepository
    : fileLlmSettingsRepository;
}
