import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupSessionBlobStore,
  createSession,
  deleteSession,
  deleteSessions,
  getSession,
  getSessionBlobMaintenanceSummary,
  listSessions,
  patchSession,
} from "../lib/session-store";
import { isSessionVersionConflictError } from "../lib/session-version-conflict";

describe("session-store", () => {
  let tempDir = "";
  let tempBlobDir = "";
  const originalStoreDir = process.env.SESSION_STORE_DIR;
  const originalBlobStoreDir = process.env.SESSION_BLOB_STORE_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-session-store-"));
    tempBlobDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-session-blobs-"));
    process.env.SESSION_STORE_DIR = tempDir;
    process.env.SESSION_BLOB_STORE_DIR = tempBlobDir;
  });

  afterEach(async () => {
    if (originalStoreDir === undefined) {
      delete process.env.SESSION_STORE_DIR;
    } else {
      process.env.SESSION_STORE_DIR = originalStoreDir;
    }
    if (originalBlobStoreDir === undefined) {
      delete process.env.SESSION_BLOB_STORE_DIR;
    } else {
      process.env.SESSION_BLOB_STORE_DIR = originalBlobStoreDir;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
    if (tempBlobDir) {
      await rm(tempBlobDir, { recursive: true, force: true });
    }
  });

  it("creates, lists, patches and reads durable sessions", async () => {
    const created = await createSession({
      title: "Test Session",
      artifacts: [
        {
          id: "artifact-1",
          artifactType: "text",
          title: "Context note",
          content: "Reusable note",
          language: null,
          position: { x: 40, y: 60 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "artifact-2",
          artifactType: "image",
          blobRef: "session-blob/diagram.png",
          title: "Diagram",
          content: "Reference diagram for the flow layout.",
          fileName: "diagram.png",
          mimeType: "image/png",
          byteSize: 4096,
          sourceDataUrl: "data:image/png;base64,ZmFrZQ==",
          language: null,
          position: { x: 180, y: 60 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      contextLinks: [
        {
          id: "link-1",
          artifactId: "artifact-1",
          targetMessageId: "assistant-1",
          createdAt: new Date().toISOString(),
        },
      ],
      snapshot: {
        headId: "assistant-1",
        messages: [
          {
            parentId: null,
            message: { id: "user-1", role: "user", content: [] },
          },
          {
            parentId: "user-1",
            message: { id: "assistant-1", role: "assistant", content: [] },
          },
        ],
      },
    });

    expect(created.title).toBe("Test Session");
    expect(created.messageCount).toBe(2);
    expect(created.version).toBe(1);

    const listed = await listSessions();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.version).toBe(1);

    const patched = await patchSession(
      created.id,
      {
        title: "Renamed Session",
        archived: true,
      },
      { expectedVersion: created.version },
    );
    expect(patched.title).toBe("Renamed Session");
    expect(patched.archived).toBe(true);
    expect(patched.version).toBe(2);

    const hidden = await listSessions();
    expect(hidden).toHaveLength(0);

    const archived = await listSessions({ includeArchived: true });
    expect(archived).toHaveLength(1);
    expect(archived[0]?.archived).toBe(true);
    expect(archived[0]?.version).toBe(2);

    const loaded = await getSession(created.id);
    expect(loaded.title).toBe("Renamed Session");
    expect(loaded.snapshot.messages).toHaveLength(2);
    expect(loaded.artifacts).toHaveLength(2);
    expect(loaded.artifacts[0]?.position).toEqual({ x: 40, y: 60 });
    expect(loaded.artifacts[1]).toMatchObject({
      artifactType: "image",
      blobRef: "session-blob/diagram.png",
      fileName: "diagram.png",
      mimeType: "image/png",
      byteSize: 4096,
      sourceDataUrl: "data:image/png;base64,ZmFrZQ==",
      position: { x: 180, y: 60 },
    });
    expect(loaded.contextLinks).toHaveLength(1);
    expect(loaded.version).toBe(2);
  });

  it("rejects a stale session patch and returns the current document", async () => {
    const created = await createSession({ title: "Versioned" });
    const updated = await patchSession(
      created.id,
      { title: "First update" },
      { expectedVersion: created.version },
    );

    let conflict: unknown = null;
    try {
      await patchSession(
        created.id,
        { title: "Stale update" },
        { expectedVersion: created.version },
      );
    } catch (error) {
      conflict = error;
    }

    expect(isSessionVersionConflictError(conflict)).toBe(true);
    if (!isSessionVersionConflictError(conflict)) {
      throw new Error("Expected a session version conflict");
    }
    expect(conflict.expectedVersion).toBe(1);
    expect(conflict.currentSession).toMatchObject({
      id: created.id,
      title: "First update",
      version: updated.version,
    });
  });

  it("serializes simultaneous file-backed patches", async () => {
    const created = await createSession({ title: "Concurrent" });
    const results = await Promise.allSettled([
      patchSession(created.id, { title: "A" }, { expectedVersion: created.version }),
      patchSession(created.id, { title: "B" }, { expectedVersion: created.version }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await getSession(created.id)).version).toBe(2);
  });

  it("deletes a durable session", async () => {
    const created = await createSession({
      title: "Delete Me",
    });

    expect((await listSessions())).toHaveLength(1);

    await deleteSession(created.id);

    expect((await listSessions())).toHaveLength(0);
    await expect(getSession(created.id)).rejects.toThrow();
  });

  it("deletes multiple durable sessions", async () => {
    const first = await createSession({ title: "First" });
    const second = await createSession({ title: "Second" });
    const third = await createSession({ title: "Third" });

    expect((await listSessions())).toHaveLength(3);

    await deleteSessions([first.id, third.id]);

    const remaining = await listSessions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(second.id);
    await expect(getSession(first.id)).rejects.toThrow();
    await expect(getSession(third.id)).rejects.toThrow();
  });

  it("ignores missing sessions during batch deletion", async () => {
    const first = await createSession({ title: "First" });
    const second = await createSession({ title: "Second" });

    await deleteSession(first.id);

    await expect(deleteSessions([first.id, second.id])).resolves.toBeUndefined();
    expect(await listSessions()).toHaveLength(0);
    await expect(getSession(second.id)).rejects.toThrow();
  });

  it("removes stale artifact blobs when artifacts disappear from a session", async () => {
    const created = await createSession({
      artifacts: [
        {
          id: "artifact-blob",
          artifactType: "file",
          blobRef: `${"blob-session-placeholder"}/notes.txt`,
          title: "Notes",
          content: "Persisted notes",
          fileName: "notes.txt",
          mimeType: "text/plain",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      title: "Blob cleanup",
    });

    const blobRef = `${created.id}/notes.txt`;
    const withBlob = await patchSession(
      created.id,
      {
        artifacts: [
          {
            id: "artifact-blob",
            artifactType: "file",
            blobRef,
            title: "Notes",
            content: "Persisted notes",
            fileName: "notes.txt",
            mimeType: "text/plain",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      { expectedVersion: created.version },
    );

    const absoluteBlobPath = path.join(tempBlobDir, blobRef);
    await mkdir(path.dirname(absoluteBlobPath), { recursive: true });
    await writeFile(absoluteBlobPath, "blob");
    await access(absoluteBlobPath);

    await patchSession(
      created.id,
      { artifacts: [] },
      { expectedVersion: withBlob.version },
    );

    await expect(access(absoluteBlobPath)).rejects.toThrow();
  });

  it("reports blob maintenance and cleans orphaned blobs", async () => {
    const created = await createSession({
      artifacts: [
        {
          id: "artifact-blob",
          artifactType: "file",
          blobRef: "placeholder",
          title: "Notes",
          content: "Persisted notes",
          fileName: "notes.txt",
          mimeType: "text/plain",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      title: "Blob maintenance",
    });

    const referencedBlobRef = `${created.id}/deduped-hash`;
    await patchSession(
      created.id,
      {
        artifacts: [
          {
            id: "artifact-blob",
            artifactType: "file",
            blobRef: referencedBlobRef,
            title: "Notes",
            content: "Persisted notes",
            fileName: "notes.txt",
            mimeType: "text/plain",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "artifact-blob-2",
            artifactType: "image",
            blobRef: referencedBlobRef,
            title: "Duplicate ref",
            content: "Same original reused",
            fileName: "notes.png",
            mimeType: "image/png",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      { expectedVersion: created.version },
    );

    const referencedBlobPath = path.join(tempBlobDir, referencedBlobRef);
    const orphanBlobPath = path.join(tempBlobDir, created.id, "orphan-hash");
    await mkdir(path.dirname(referencedBlobPath), { recursive: true });
    await writeFile(referencedBlobPath, "kept");
    await writeFile(orphanBlobPath, "orphan");

    const maintenanceBeforeCleanup = await getSessionBlobMaintenanceSummary();
    expect(maintenanceBeforeCleanup).toMatchObject({
      deduplicatedBlobLinks: 1,
      orphanBlobCount: 1,
      referencedBlobCount: 1,
      totalBlobCount: 2,
      uniqueReferencedBlobCount: 1,
    });

    const cleanup = await cleanupSessionBlobStore();
    expect(cleanup.deletedBlobCount).toBe(1);
    expect(cleanup.maintenance.orphanBlobCount).toBe(0);
    await access(referencedBlobPath);
    await expect(access(orphanBlobPath)).rejects.toThrow();
  });
});
