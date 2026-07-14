import { describe, expect, it } from "vitest";
import type { SessionSummary, SessionThreadExport } from "@/lib/session-documents";
import {
  buildSessionSnapshotCacheKey,
  getSessionPatchBodyBytes,
  parseCachedSessionSnapshot,
  pickSessionId,
  selectRecoverableSessionSnapshot,
  shouldKeepaliveSessionPatch,
} from "@/lib/client/session-persistence";

const snapshot = (messageCount: number): SessionThreadExport => ({
  headId: messageCount > 0 ? `message-${messageCount}` : null,
  messages: Array.from({ length: messageCount }, (_, index) => ({
    message: { id: `message-${index + 1}` },
    parentId: index === 0 ? null : `message-${index}`,
  })),
});

const summary = (
  id: string,
  archived = false,
): SessionSummary => ({
  archived,
  createdAt: "2026-01-01T00:00:00.000Z",
  id,
  messageCount: 0,
  title: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
});

describe("session persistence", () => {
  it("builds a stable snapshot cache key", () => {
    expect(buildSessionSnapshotCacheKey("session-1")).toBe(
      "nodes.session-snapshot-cache.v1:session-1",
    );
  });

  it("parses valid cached snapshots and rejects malformed JSON", () => {
    const cached = snapshot(2);
    expect(
      parseCachedSessionSnapshot(JSON.stringify({ snapshot: cached })),
    ).toEqual(cached);
    expect(parseCachedSessionSnapshot("{")) .toBeNull();
  });

  it("recovers only when the cached snapshot contains more messages", () => {
    expect(selectRecoverableSessionSnapshot(snapshot(3), snapshot(2))).toEqual(
      snapshot(3),
    );
    expect(selectRecoverableSessionSnapshot(snapshot(2), snapshot(2))).toBeNull();
    expect(selectRecoverableSessionSnapshot(null, snapshot(2))).toBeNull();
  });

  it("selects preferred, visible, and fallback sessions deterministically", () => {
    const sessions = [summary("archived", true), summary("active")];
    expect(pickSessionId(sessions, { preferredId: "archived" })).toBe(
      "archived",
    );
    expect(pickSessionId(sessions)).toBe("active");
    expect(pickSessionId(sessions, { excludeIds: ["active"] })).toBe(
      "archived",
    );
  });

  it("uses keepalive only while the serialized patch stays within the safe limit", () => {
    expect(shouldKeepaliveSessionPatch({ title: "small" }, 1)).toBe(true);
    expect(
      shouldKeepaliveSessionPatch({ title: "x".repeat(70 * 1024) }, 1),
    ).toBe(false);
    expect(getSessionPatchBodyBytes({ title: "small" }, 1)).toBeGreaterThan(0);
  });
});
