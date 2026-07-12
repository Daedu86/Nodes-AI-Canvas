import { describe, expect, it } from "vitest";
import {
  toSessionDocumentFromRow,
  toSessionSummaryFromRow,
} from "../lib/persistence/supabase/shared";
import {
  CURRENT_SESSION_SCHEMA_VERSION,
  resolveMaterializedMessageCount,
  resolveSessionSchemaVersion,
  UnsupportedSessionSchemaVersionError,
} from "../lib/persistence/session-schema-version";

const baseRow = {
  archived: false,
  created_at: "2026-07-12T18:00:00.000Z",
  id: "session-1",
  title: "Schema evolution",
  updated_at: "2026-07-12T18:10:00.000Z",
  version: 3,
};

describe("session JSONB schema evolution", () => {
  it("uses materialized message_count without reading snapshot_json", () => {
    const row = {
      ...baseRow,
      message_count: "7",
      schema_version: CURRENT_SESSION_SCHEMA_VERSION,
    };
    Object.defineProperty(row, "snapshot_json", {
      get() {
        throw new Error("summary query should not read snapshot_json");
      },
    });

    expect(toSessionSummaryFromRow(row)).toMatchObject({
      id: "session-1",
      messageCount: 7,
      version: 3,
    });
  });

  it("falls back to legacy snapshot rows without evolution columns", () => {
    const summary = toSessionSummaryFromRow({
      ...baseRow,
      snapshot_json: {
        headId: "message-2",
        messages: [
          { message: { id: "message-1" }, parentId: null },
          { message: { id: "message-2" }, parentId: "message-1" },
        ],
      },
    });

    expect(summary.messageCount).toBe(2);
  });

  it("normalizes a current-version full session document", () => {
    const document = toSessionDocumentFromRow({
      ...baseRow,
      artifacts_json: [],
      context_links_json: [],
      message_count: 1,
      schema_version: CURRENT_SESSION_SCHEMA_VERSION,
      snapshot_json: {
        headId: "message-1",
        messages: [{ message: { id: "message-1" }, parentId: null }],
      },
    });

    expect(document).toMatchObject({
      artifacts: [],
      contextLinks: [],
      messageCount: 1,
      snapshot: {
        headId: "message-1",
      },
    });
  });

  it("rejects an unknown future schema instead of silently rewriting it", () => {
    expect(() =>
      toSessionSummaryFromRow({
        ...baseRow,
        message_count: 1,
        schema_version: 2,
      }),
    ).toThrow(UnsupportedSessionSchemaVersionError);
  });

  it("accepts legacy missing schema versions as version 1", () => {
    expect(resolveSessionSchemaVersion(undefined)).toBe(1);
    expect(resolveSessionSchemaVersion("1")).toBe(1);
    expect(() => resolveSessionSchemaVersion(0)).toThrow(
      "Invalid session schema version.",
    );
  });

  it("uses a fallback only for invalid materialized counts", () => {
    let calls = 0;
    const fallback = () => {
      calls += 1;
      return 4;
    };

    expect(resolveMaterializedMessageCount(3, fallback)).toBe(3);
    expect(calls).toBe(0);
    expect(resolveMaterializedMessageCount(-1, fallback)).toBe(4);
    expect(calls).toBe(1);
  });
});
