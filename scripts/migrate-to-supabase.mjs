import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();

const readRequiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const resolveDir = (envName, fallbackSegments) =>
  process.env[envName]?.trim()
    ? path.resolve(process.env[envName])
    : path.join(projectRoot, ...fallbackSegments);

const sessionStoreDir = resolveDir("SESSION_STORE_DIR", ["data", "sessions"]);
const projectStoreDir = resolveDir("PROJECT_STORE_DIR", ["data", "projects"]);
const memoryStoreDir = resolveDir("PROJECT_MEMORY_STORE_DIR", ["data", "memory"]);
const llmSettingsStoreDir = resolveDir("LLM_SETTINGS_STORE_DIR", ["data", "llm-settings"]);
const blobStoreDir = resolveDir("SESSION_BLOB_STORE_DIR", ["data", "session-blobs"]);

const supabaseUrl = readRequiredEnv("SUPABASE_URL");
const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const storageBucket =
  process.env.SUPABASE_SESSION_ARTIFACTS_BUCKET?.trim() || "session-artifacts";
const fallbackOwnerId = process.env.SUPABASE_MIGRATION_OWNER_ID?.trim() || null;

const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeOwnerId = (value, kind, id) => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (fallbackOwnerId) {
    return fallbackOwnerId;
  }
  throw new Error(
    `Missing ownerId for ${kind} ${id}. Set SUPABASE_MIGRATION_OWNER_ID to import ownerless local data.`,
  );
};

const listJsonFiles = async (dir) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const uniqueStrings = (value) =>
  [...new Set(safeArray(value).filter((entry) => typeof entry === "string" && entry.length > 0))];

const maybeString = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const collectLocalIds = async (dir) => {
  const files = await listJsonFiles(dir);
  const ids = new Set();
  for (const filePath of files) {
    const json = await readJson(filePath);
    const id = maybeString(json.id);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
};

const ensureBucketExists = async () => {
  const { data, error } = await client.storage.listBuckets();
  if (error) {
    throw new Error(error.message || "Failed to inspect Supabase storage buckets");
  }
  if (!safeArray(data).some((bucket) => bucket?.name === storageBucket || bucket?.id === storageBucket)) {
    throw new Error(
      `Storage bucket "${storageBucket}" does not exist. Create it first, or run the SQL schema setup.`,
    );
  }
};

const migrateSessions = async () => {
  const files = await listJsonFiles(sessionStoreDir);
  const sessions = [];
  for (const filePath of files) {
    const json = await readJson(filePath);
    sessions.push({
      id: json.id,
      owner_id: normalizeOwnerId(json.ownerId, "session", json.id || path.basename(filePath)),
      title: maybeString(json.title),
      archived: json.archived === true,
      snapshot_json: json.snapshot ?? { headId: null, messages: [] },
      artifacts_json: safeArray(json.artifacts),
      context_links_json: safeArray(json.contextLinks),
      created_at:
        typeof json.createdAt === "string" && json.createdAt.length > 0
          ? json.createdAt
          : new Date().toISOString(),
      updated_at:
        typeof json.updatedAt === "string" && json.updatedAt.length > 0
          ? json.updatedAt
          : new Date().toISOString(),
    });
  }

  if (sessions.length === 0) {
    return { rows: [], uploadedBlobs: 0, missingBlobs: [] };
  }

  const { error } = await client.from("sessions").upsert(sessions, { onConflict: "id" });
  if (error) {
    throw new Error(error.message || "Failed to upsert sessions");
  }

  let uploadedBlobs = 0;
  const missingBlobs = [];

  for (const session of sessions) {
    for (const artifact of safeArray(session.artifacts_json)) {
      const blobRef = maybeString(artifact?.blobRef);
      if (!blobRef) continue;
      const localBlobPath = path.join(blobStoreDir, ...blobRef.split("/"));
      try {
        const bytes = await fs.readFile(localBlobPath);
        const upload = await client.storage.from(storageBucket).upload(blobRef, bytes, {
          upsert: true,
          contentType: maybeString(artifact?.mimeType) ?? undefined,
        });
        if (upload.error) {
          throw new Error(upload.error.message || `Failed to upload blob ${blobRef}`);
        }
        uploadedBlobs += 1;
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
          missingBlobs.push(blobRef);
          continue;
        }
        throw error;
      }
    }
  }

  return {
    rows: sessions,
    uploadedBlobs,
    missingBlobs,
  };
};

const migrateProjects = async () => {
  const files = await listJsonFiles(projectStoreDir);
  const projects = [];
  const projectSessionLinks = [];
  const projectMemoryLinks = [];

  for (const filePath of files) {
    const json = await readJson(filePath);
    const projectId = json.id;
    projects.push({
      id: projectId,
      owner_id: normalizeOwnerId(json.ownerId, "project", projectId || path.basename(filePath)),
      title: maybeString(json.title),
      global_context: typeof json.globalContext === "string" ? json.globalContext : "",
      arena_winner_session_id: maybeString(json.arenaWinnerSessionId),
      arena_winner_branch_key: maybeString(json.arenaWinnerBranchKey),
      created_at:
        typeof json.createdAt === "string" && json.createdAt.length > 0
          ? json.createdAt
          : new Date().toISOString(),
      updated_at:
        typeof json.updatedAt === "string" && json.updatedAt.length > 0
          ? json.updatedAt
          : new Date().toISOString(),
    });

    uniqueStrings(json.sessionIds).forEach((sessionId, index) => {
      projectSessionLinks.push({
        project_id: projectId,
        session_id: sessionId,
        position: index,
      });
    });

    uniqueStrings(json.memoryIds).forEach((memoryId) => {
      projectMemoryLinks.push({
        project_id: projectId,
        memory_id: memoryId,
      });
    });
  }

  if (projects.length === 0) {
    return { projects: 0, projectSessionLinks: 0, projectMemoryLinks: 0 };
  }

  const { error } = await client.from("projects").upsert(projects, { onConflict: "id" });
  if (error) {
    throw new Error(error.message || "Failed to upsert projects");
  }

  const projectIds = projects.map((project) => project.id);
  await client.from("project_sessions").delete().in("project_id", projectIds);
  await client.from("project_memory_links").delete().in("project_id", projectIds);

  if (projectSessionLinks.length > 0) {
    const linksInsert = await client.from("project_sessions").insert(projectSessionLinks);
    if (linksInsert.error) {
      throw new Error(linksInsert.error.message || "Failed to insert project_sessions");
    }
  }

  if (projectMemoryLinks.length > 0) {
    const linksInsert = await client.from("project_memory_links").insert(projectMemoryLinks);
    if (linksInsert.error) {
      throw new Error(linksInsert.error.message || "Failed to insert project_memory_links");
    }
  }

  return {
    projects: projects.length,
    projectSessionLinks: projectSessionLinks.length,
    projectMemoryLinks: projectMemoryLinks.length,
  };
};

const migrateMemory = async () => {
  const files = await listJsonFiles(memoryStoreDir);
  const localProjectIds = await collectLocalIds(projectStoreDir);
  const localSessionIds = await collectLocalIds(sessionStoreDir);
  const memoryRows = [];

  for (const filePath of files) {
    const json = await readJson(filePath);
    const sourceProjectId = maybeString(json.sourceProjectId);
    const sourceSessionId = maybeString(json.sourceSessionId);
    memoryRows.push({
      id: json.id,
      owner_id: normalizeOwnerId(json.ownerId, "memory", json.id || path.basename(filePath)),
      title: typeof json.title === "string" ? json.title.trim() : "",
      content: typeof json.content === "string" ? json.content : "",
      type: json.type,
      source_project_id: sourceProjectId && localProjectIds.has(sourceProjectId) ? sourceProjectId : null,
      source_session_id: sourceSessionId && localSessionIds.has(sourceSessionId) ? sourceSessionId : null,
      source_kind:
        json.sourceKind === "session" || json.sourceKind === "branch"
          ? json.sourceKind
          : null,
      source_keys: uniqueStrings(json.sourceKeys),
      created_at:
        typeof json.createdAt === "string" && json.createdAt.length > 0
          ? json.createdAt
          : new Date().toISOString(),
      updated_at:
        typeof json.updatedAt === "string" && json.updatedAt.length > 0
          ? json.updatedAt
          : new Date().toISOString(),
    });
  }

  if (memoryRows.length === 0) {
    return { memory: 0 };
  }

  const { error } = await client.from("memory_items").upsert(memoryRows, { onConflict: "id" });
  if (error) {
    throw new Error(error.message || "Failed to upsert memory_items");
  }

  return { memory: memoryRows.length };
};

const migrateLlmSettings = async () => {
  const files = await listJsonFiles(llmSettingsStoreDir);
  const settingsRows = [];

  for (const filePath of files) {
    const json = await readJson(filePath);
    const ownerId = normalizeOwnerId(
      json.ownerId,
      "llm-settings",
      json.ownerId || path.basename(filePath),
    );
    settingsRows.push({
      owner_id: ownerId,
      settings_json: typeof json.settings === "object" && json.settings ? json.settings : {},
      created_at:
        typeof json.createdAt === "string" && json.createdAt.length > 0
          ? json.createdAt
          : new Date().toISOString(),
      updated_at:
        typeof json.updatedAt === "string" && json.updatedAt.length > 0
          ? json.updatedAt
          : new Date().toISOString(),
    });
  }

  if (settingsRows.length === 0) {
    return { llmSettings: 0 };
  }

  const { error } = await client.from("llm_settings").upsert(settingsRows, {
    onConflict: "owner_id",
  });
  if (error) {
    throw new Error(error.message || "Failed to upsert llm_settings");
  }

  return { llmSettings: settingsRows.length };
};

const main = async () => {
  console.log("Migrating local Nodes data to Supabase...");
  console.log(`- sessions: ${sessionStoreDir}`);
  console.log(`- projects: ${projectStoreDir}`);
  console.log(`- memory: ${memoryStoreDir}`);
  console.log(`- llm settings: ${llmSettingsStoreDir}`);
  console.log(`- blobs: ${blobStoreDir}`);
  console.log(`- bucket: ${storageBucket}`);

  await ensureBucketExists();

  const sessionResult = await migrateSessions();
  const projectResult = await migrateProjects();
  const memoryResult = await migrateMemory();
  const llmSettingsResult = await migrateLlmSettings();

  console.log("Migration complete.");
  console.log(`- sessions upserted: ${sessionResult.rows.length}`);
  console.log(`- blobs uploaded: ${sessionResult.uploadedBlobs}`);
  console.log(`- missing blobs: ${sessionResult.missingBlobs.length}`);
  console.log(`- projects upserted: ${projectResult.projects}`);
  console.log(`- project/session links: ${projectResult.projectSessionLinks}`);
  console.log(`- project/memory links: ${projectResult.projectMemoryLinks}`);
  console.log(`- memory rows upserted: ${memoryResult.memory}`);
  console.log(`- llm settings upserted: ${llmSettingsResult.llmSettings}`);

  if (sessionResult.missingBlobs.length > 0) {
    console.log("Missing blob refs:");
    sessionResult.missingBlobs.forEach((blobRef) => console.log(`  - ${blobRef}`));
  }
};

main().catch((error) => {
  console.error("Supabase migration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
