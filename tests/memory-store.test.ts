import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  createMemoryItem,
  deleteMemoryItem,
  listMemoryItems,
  patchMemoryItem,
} from "../lib/memory-store";

describe("memory-store", () => {
  let tempDir = "";
  const originalStoreDir = process.env.PROJECT_MEMORY_STORE_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-memory-store-"));
    process.env.PROJECT_MEMORY_STORE_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalStoreDir === undefined) {
      delete process.env.PROJECT_MEMORY_STORE_DIR;
    } else {
      process.env.PROJECT_MEMORY_STORE_DIR = originalStoreDir;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates, lists, patches, and deletes reusable memory items", async () => {
    const created = await createMemoryItem({
      content: "Winning branch synthesis for the architecture review.",
      sourceProjectId: "project-1",
      sourceKeys: ["session-1:root-a", "session-2:root-b"],
      sourceKind: "branch",
      sourceSessionId: "session-1",
      title: "Arena winner",
      type: "summary",
    });

    expect(created.title).toBe("Arena winner");
    expect(created.type).toBe("summary");

    const listed = await listMemoryItems();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      sourceProjectId: "project-1",
      sourceKeys: ["session-1:root-a", "session-2:root-b"],
      sourceKind: "branch",
      sourceSessionId: "session-1",
      title: "Arena winner",
      type: "summary",
    });

    const patched = await patchMemoryItem(created.id, {
      content: "Decision captured from arena.",
      sourceKind: "session",
      title: "Decision note",
      type: "decision",
    });
    expect(patched).toMatchObject({
      content: "Decision captured from arena.",
      sourceKind: "session",
      title: "Decision note",
      type: "decision",
    });

    await deleteMemoryItem(created.id);
    expect(await listMemoryItems()).toHaveLength(0);
  });
});
