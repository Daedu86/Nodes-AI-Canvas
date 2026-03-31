import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  createProject,
  deleteProject,
  deleteProjects,
  getProject,
  listProjects,
  patchProject,
} from "../lib/project-store";

describe("project-store", () => {
  let tempDir = "";
  const originalStoreDir = process.env.PROJECT_STORE_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-project-store-"));
    process.env.PROJECT_STORE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalStoreDir === undefined) {
      delete process.env.PROJECT_STORE_DIR;
    } else {
      process.env.PROJECT_STORE_DIR = originalStoreDir;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates, lists, patches, and reads durable projects", async () => {
    const created = await createProject({
      title: "Platform rethink",
      memoryIds: ["memory-a"],
      sessionIds: ["session-a", "session-b"],
      globalContext: "Compare the best branches from the platform work.",
    });

    expect(created.title).toBe("Platform rethink");
    expect(created.sessionCount).toBe(2);
    expect(created.arenaWinnerBranchKey).toBeNull();
    expect(created.memoryIds).toEqual(["memory-a"]);
    expect(created.arenaWinnerSessionId).toBeNull();

    const listed = await listProjects();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      sessionCount: 2,
      title: "Platform rethink",
    });

    const patched = await patchProject(created.id, {
      arenaWinnerBranchKey: "session-c:root-1",
      arenaWinnerSessionId: "session-c",
      globalContext: "Merge session context into one review canvas.",
      memoryIds: ["memory-b", "memory-c"],
      sessionIds: ["session-b", "session-c"],
      title: "Merged review board",
    });
    expect(patched).toMatchObject({
      arenaWinnerBranchKey: "session-c:root-1",
      arenaWinnerSessionId: "session-c",
      globalContext: "Merge session context into one review canvas.",
      memoryIds: ["memory-b", "memory-c"],
      sessionCount: 2,
      sessionIds: ["session-b", "session-c"],
      title: "Merged review board",
    });

    const loaded = await getProject(created.id);
    expect(loaded).toEqual(patched);
  });

  it("deletes projects individually and in batches", async () => {
    const first = await createProject({ title: "First" });
    const second = await createProject({ title: "Second" });
    const third = await createProject({ title: "Third" });

    await deleteProject(first.id);
    expect((await listProjects()).map((project) => project.id)).toEqual([third.id, second.id]);

    await deleteProjects([second.id, third.id]);
    expect(await listProjects()).toHaveLength(0);
  });
});
