import { describe, expect, it } from "vitest";
import {
  filterRemovedSessions,
  isActiveSessionRemoved,
} from "@/components/context/use-session-lifecycle";
import type { SessionSummary } from "@/lib/session-documents";

const summary = (id: string): SessionSummary => ({
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  id,
  messageCount: 0,
  title: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
});

describe("session lifecycle helpers", () => {
  it("filters every removed session while preserving list order", () => {
    expect(
      filterRemovedSessions(
        [summary("a"), summary("b"), summary("c")],
        ["b", "missing"],
      ).map((session) => session.id),
    ).toEqual(["a", "c"]);
  });

  it("detects only when the active session is part of the removed set", () => {
    expect(isActiveSessionRemoved("b", ["a", "b"])).toBe(true);
    expect(isActiveSessionRemoved("c", ["a", "b"])).toBe(false);
    expect(isActiveSessionRemoved(null, ["a"])).toBe(false);
  });
});
