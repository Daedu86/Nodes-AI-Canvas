import { describe, expect, it } from "vitest";
import {
  decideAfterSessionRemoval,
  decideMissingSessionRecovery,
  decideSessionBootstrap,
  decideSessionLoadFailure,
} from "@/lib/client/session-orchestration";
import type { SessionSummary } from "@/lib/session-documents";

const session = (id: string, archived = false): SessionSummary => ({
  archived,
  createdAt: "2026-01-01T00:00:00.000Z",
  id,
  messageCount: 0,
  title: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
});

describe("session orchestration decisions", () => {
  it("creates during bootstrap when the account has no sessions", () => {
    expect(decideSessionBootstrap([])).toEqual({ type: "create" });
  });

  it("loads the preferred session and otherwise the first visible session", () => {
    const sessions = [session("archived", true), session("active")];
    expect(decideSessionBootstrap(sessions, "archived")).toEqual({
      sessionId: "archived",
      type: "load",
    });
    expect(decideSessionBootstrap(sessions)).toEqual({
      sessionId: "active",
      type: "load",
    });
  });

  it("falls back after a load error and clears when no fallback exists", () => {
    const sessions = [session("first"), session("second")];
    expect(decideSessionLoadFailure(sessions, "first")).toEqual({
      sessionId: "second",
      type: "load",
    });
    expect(decideSessionLoadFailure([session("only")], "only")).toEqual({
      type: "clear",
    });
  });

  it("keeps the current session when a different session is removed", () => {
    expect(
      decideAfterSessionRemoval({
        activeSessionId: "active",
        remainingSessions: [session("active")],
        removedSessionIds: ["other"],
      }),
    ).toEqual({ type: "keep" });
  });

  it("loads a preferred remaining session after deleting the active one", () => {
    expect(
      decideAfterSessionRemoval({
        activeSessionId: "deleted",
        preferredId: "preferred",
        remainingSessions: [session("fallback"), session("preferred")],
        removedSessionIds: ["deleted"],
      }),
    ).toEqual({ sessionId: "preferred", type: "load" });
  });

  it("creates a replacement when removing the active session leaves none", () => {
    expect(
      decideAfterSessionRemoval({
        activeSessionId: "deleted",
        remainingSessions: [],
        removedSessionIds: ["deleted"],
      }),
    ).toEqual({ type: "create" });
  });

  it("recovers only when the missing session is active", () => {
    expect(
      decideMissingSessionRecovery({
        activeSessionId: "active",
        missingSessionId: "other",
        visibleSessions: [session("active")],
      }),
    ).toEqual({ type: "keep" });
    expect(
      decideMissingSessionRecovery({
        activeSessionId: "missing",
        missingSessionId: "missing",
        visibleSessions: [session("fallback")],
      }),
    ).toEqual({ sessionId: "fallback", type: "load" });
    expect(
      decideMissingSessionRecovery({
        activeSessionId: "missing",
        missingSessionId: "missing",
        visibleSessions: [],
      }),
    ).toEqual({ type: "create" });
  });
});
