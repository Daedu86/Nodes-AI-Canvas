import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveSessionArtifactBlob } from "../lib/session-blob-store";

describe("session-blob-store", () => {
  let tempBlobDir = "";
  const originalBlobStoreDir = process.env.SESSION_BLOB_STORE_DIR;

  beforeEach(async () => {
    tempBlobDir = await mkdtemp(path.join(os.tmpdir(), "ai-canvas-blob-store-"));
    process.env.SESSION_BLOB_STORE_DIR = tempBlobDir;
  });

  afterEach(async () => {
    if (originalBlobStoreDir === undefined) {
      delete process.env.SESSION_BLOB_STORE_DIR;
    } else {
      process.env.SESSION_BLOB_STORE_DIR = originalBlobStoreDir;
    }
    if (tempBlobDir) {
      await rm(tempBlobDir, { recursive: true, force: true });
    }
  });

  it("deduplicates identical bytes within the same session", async () => {
    const first = await saveSessionArtifactBlob({
      bytes: new Uint8Array([1, 2, 3, 4]),
      fileName: "diagram-a.png",
      sessionId: "session123",
    });
    const second = await saveSessionArtifactBlob({
      bytes: new Uint8Array([1, 2, 3, 4]),
      fileName: "diagram-b.png",
      sessionId: "session123",
    });

    expect(first.blobRef).toBe(second.blobRef);
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);

    const sessionDirEntries = await readdir(path.join(tempBlobDir, "session123"));
    expect(sessionDirEntries).toHaveLength(1);
    await expect(readFile(first.absolutePath)).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
  });
});
