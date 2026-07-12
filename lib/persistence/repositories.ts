import { getPersistenceBackend } from "@/lib/persistence/backend";
import type { AgentWorkRepository } from "@/lib/persistence/agent-work-repository";
import type { ChatConcurrencyRepository } from "@/lib/persistence/chat-concurrency-repository";
import type { ChatUsageRepository } from "@/lib/persistence/chat-usage-repository";
import { fileAgentWorkRepository } from "@/lib/persistence/file/file-agent-work-repository";
import { fileChatConcurrencyRepository } from "@/lib/persistence/file/file-chat-concurrency-repository";
import { fileChatUsageRepository } from "@/lib/persistence/file/file-chat-usage-repository";
import { fileLlmSettingsRepository } from "@/lib/persistence/file/file-llm-settings-repository";
import { fileMemoryRepository } from "@/lib/persistence/file/file-memory-repository";
import { fileProjectInvitationRepository } from "@/lib/persistence/file/file-project-invitation-repository";
import { fileProjectRepositoryV2 } from "@/lib/persistence/file/file-project-repository-v2";
import { fileSessionRepository } from "@/lib/persistence/file/file-session-repository";
import { fileUserPlanRepository } from "@/lib/persistence/file/file-user-plan-repository";
import type { LlmSettingsRepository } from "@/lib/persistence/llm-settings-repository";
import type { MemoryRepository } from "@/lib/persistence/memory-repository";
import type { ProjectInvitationRepository } from "@/lib/persistence/project-invitation-repository";
import type { ProjectRepository } from "@/lib/persistence/project-repository";
import type { SessionRepository } from "@/lib/persistence/session-repository";
import { supabaseAgentWorkRepository } from "@/lib/persistence/supabase/supabase-agent-work-repository";
import { supabaseChatConcurrencyRepository } from "@/lib/persistence/supabase/supabase-chat-concurrency-repository";
import { supabaseChatUsageRepository } from "@/lib/persistence/supabase/supabase-chat-usage-repository";
import { supabaseLlmSettingsRepository } from "@/lib/persistence/supabase/supabase-llm-settings-repository";
import { supabaseMemoryRepository } from "@/lib/persistence/supabase/supabase-memory-repository";
import { supabaseProjectInvitationRepository } from "@/lib/persistence/supabase/supabase-project-invitation-repository";
import { supabaseProjectRepository } from "@/lib/persistence/supabase/supabase-project-repository";
import { supabaseSessionRepository } from "@/lib/persistence/supabase/supabase-session-repository";
import { supabaseUserPlanRepository } from "@/lib/persistence/supabase/supabase-user-plan-repository";
import type { UserPlanRepository } from "@/lib/persistence/user-plan-repository";

export function getSessionRepository(): SessionRepository {
  return getPersistenceBackend() === "supabase" ? supabaseSessionRepository : fileSessionRepository;
}

export function getProjectRepository(): ProjectRepository {
  return getPersistenceBackend() === "supabase" ? supabaseProjectRepository : fileProjectRepositoryV2;
}

export function getProjectInvitationRepository(): ProjectInvitationRepository {
  return getPersistenceBackend() === "supabase"
    ? supabaseProjectInvitationRepository
    : fileProjectInvitationRepository;
}

export function getMemoryRepository(): MemoryRepository {
  return getPersistenceBackend() === "supabase" ? supabaseMemoryRepository : fileMemoryRepository;
}

export function getLlmSettingsRepository(): LlmSettingsRepository {
  return getPersistenceBackend() === "supabase" ? supabaseLlmSettingsRepository : fileLlmSettingsRepository;
}

export function getAgentWorkRepository(): AgentWorkRepository {
  return getPersistenceBackend() === "supabase" ? supabaseAgentWorkRepository : fileAgentWorkRepository;
}

export function getUserPlanRepository(): UserPlanRepository {
  return getPersistenceBackend() === "supabase" ? supabaseUserPlanRepository : fileUserPlanRepository;
}

export function getChatUsageRepository(): ChatUsageRepository {
  return getPersistenceBackend() === "supabase" ? supabaseChatUsageRepository : fileChatUsageRepository;
}

export function getChatConcurrencyRepository(): ChatConcurrencyRepository {
  return getPersistenceBackend() === "supabase" ? supabaseChatConcurrencyRepository : fileChatConcurrencyRepository;
}
