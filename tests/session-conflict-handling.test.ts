import { describe, expect, it } from "vitest";
import { matchesSessionConflict } from "@/components/context/use-session-conflict-resolution";
import { readSessionConflictResponse } from "@/lib/client/session-persistence";
import { SESSION_VERSION_CONFLICT_CODE } from "@/lib/session-version-conflict";
import type { SessionDocument } from "@/lib/session-documents";

const currentSession: SessionDocument = {
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "session-1",
  messageCount: 0,
  snapshot: { headId: null, messages: [] },
  title: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 2,
};

const conflictError = (payload: unknown, status = 409) =>
  Object.assign(new Error("request failed"), { payload, status });

describe("session conflict handling", () => {
  it("parses a valid version-conflict response", () => {
    const parsed = readSessionConflictResponse(
      conflictError({
        code: SESSION_VERSION_CONFLICT_CODE,
        error: "changed elsewhere",
        expectedVersion: 1,
        session: currentSession,
      }),
    );
    expect(parsed?.session).toEqual(currentSession);
    expect(parsed?.expectedVersion).toBe(1);
  });

  it("rejects unrelated statuses and malformed conflict payloads", () => {
    expect(readSessionConflictResponse(conflictError({}, 500))).toBeNull();
    expect(
      readSessionConflictResponse(
        conflictError({ code: "other", session: currentSession }),
      ),
    ).toBeNull();
    expect(
      readSessionConflictResponse(
        conflictError({ code: SESSION_VERSION_CONFLICT_CODE, session: {} }),
      ),
    ).toBeNull();
  });

  it("matches conflicts only to their owning session", () => {
    const conflict = {
      attemptedPatch: { title: "local" },
      currentSession,
      sessionId: currentSession.id,
    };
    expect(matchesSessionConflict(conflict, "session-1")).toBe(true);
    expect(matchesSessionConflict(conflict, "session-2")).toBe(false);
    expect(matchesSessionConflict(null, "session-1")).toBe(false);
  });
});
