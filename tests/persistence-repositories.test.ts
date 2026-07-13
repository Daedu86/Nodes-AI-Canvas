import { afterEach, describe, expect, it } from "vitest";
import { getPersistenceBackend } from "../lib/persistence/backend";
import { fileAgentWorkRepository } from "../lib/persistence/file/file-agent-work-repository";
import { fileChatConcurrencyRepository } from "../lib/persistence/file/file-chat-concurrency-repository";
import { fileChatUsageRepository } from "../lib/persistence/file/file-chat-usage-repository";
import { fileLlmSettingsRepository } from "../lib/persistence/file/file-llm-settings-repository";
import { fileMemoryRepository } from "../lib/persistence/file/file-memory-repository";
import { fileProjectInvitationRepository } from "../lib/persistence/file/file-project-invitation-repository";
import { fileProjectRepositoryV2 } from "../lib/persistence/file/file-project-repository-v2";
import { fileSessionRepository } from "../lib/persistence/file/file-session-repository";
import { fileUserPlanRepository } from "../lib/persistence/file/file-user-plan-repository";
import {
  getAgentWorkRepository,
  getChatConcurrencyRepository,
  getChatUsageRepository,
  getLlmSettingsRepository,
  getMemoryRepository,
  getProjectInvitationRepository,
  getProjectRepository,
  getSessionRepository,
  getUserPlanRepository,
} from "../lib/persistence/repositories";
import { supabaseAgentWorkRepository } from "../lib/persistence/supabase/supabase-agent-work-repository";
import { supabaseChatConcurrencyRepository } from "../lib/persistence/supabase/supabase-chat-concurrency-repository";
import { supabaseChatUsageRepository } from "../lib/persistence/supabase/supabase-chat-usage-repository";
import { supabaseLlmSettingsRepository } from "../lib/persistence/supabase/supabase-llm-settings-repository";
import { supabaseMemoryRepository } from "../lib/persistence/supabase/supabase-memory-repository";
import { supabaseProjectInvitationRepository } from "../lib/persistence/supabase/supabase-project-invitation-repository";
import { supabaseProjectRepository } from "../lib/persistence/supabase/supabase-project-repository";
import { supabaseSessionRepository } from "../lib/persistence/supabase/supabase-session-repository";
import { supabaseUserPlanRepository } from "../lib/persistence/supabase/supabase-user-plan-repository";

const originalBackend = process.env.NODES_PERSISTENCE_BACKEND;

const repositoryCases = [
  {
    file: fileSessionRepository,
    get: getSessionRepository,
    name: "sessions",
    supabase: supabaseSessionRepository,
  },
  {
    file: fileProjectRepositoryV2,
    get: getProjectRepository,
    name: "projects",
    supabase: supabaseProjectRepository,
  },
  {
    file: fileProjectInvitationRepository,
    get: getProjectInvitationRepository,
    name: "project invitations",
    supabase: supabaseProjectInvitationRepository,
  },
  {
    file: fileMemoryRepository,
    get: getMemoryRepository,
    name: "memory",
    supabase: supabaseMemoryRepository,
  },
  {
    file: fileLlmSettingsRepository,
    get: getLlmSettingsRepository,
    name: "LLM settings",
    supabase: supabaseLlmSettingsRepository,
  },
  {
    file: fileAgentWorkRepository,
    get: getAgentWorkRepository,
    name: "agent work",
    supabase: supabaseAgentWorkRepository,
  },
  {
    file: fileUserPlanRepository,
    get: getUserPlanRepository,
    name: "user plans",
    supabase: supabaseUserPlanRepository,
  },
  {
    file: fileChatUsageRepository,
    get: getChatUsageRepository,
    name: "chat usage",
    supabase: supabaseChatUsageRepository,
  },
  {
    file: fileChatConcurrencyRepository,
    get: getChatConcurrencyRepository,
    name: "chat concurrency",
    supabase: supabaseChatConcurrencyRepository,
  },
] as const;

afterEach(() => {
  if (originalBackend === undefined) {
    delete process.env.NODES_PERSISTENCE_BACKEND;
  } else {
    process.env.NODES_PERSISTENCE_BACKEND = originalBackend;
  }
});

describe("persistence repository selection", () => {
  it("defaults unknown or missing backend values to file persistence", () => {
    delete process.env.NODES_PERSISTENCE_BACKEND;
    expect(getPersistenceBackend()).toBe("file");

    process.env.NODES_PERSISTENCE_BACKEND = "SUPABASE";
    expect(getPersistenceBackend()).toBe("file");

    process.env.NODES_PERSISTENCE_BACKEND = "";
    expect(getPersistenceBackend()).toBe("file");
  });

  it("recognizes the explicit Supabase backend", () => {
    process.env.NODES_PERSISTENCE_BACKEND = "supabase";
    expect(getPersistenceBackend()).toBe("supabase");
  });

  it("routes every repository to the file implementation by default", () => {
    process.env.NODES_PERSISTENCE_BACKEND = "file";

    for (const repository of repositoryCases) {
      expect(repository.get(), repository.name).toBe(repository.file);
    }
  });

  it("routes every repository to the Supabase implementation when enabled", () => {
    process.env.NODES_PERSISTENCE_BACKEND = "supabase";

    for (const repository of repositoryCases) {
      expect(repository.get(), repository.name).toBe(repository.supabase);
    }
  });
});
