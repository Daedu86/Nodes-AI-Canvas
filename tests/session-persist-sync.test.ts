// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_RUNTIME_CHANGED_EVENT,
  isSessionPersistSuspended,
  markSessionPersistSettled,
  resumeSessionPersist,
  suspendSessionPersist,
} from "../lib/session-persist-sync";

describe("session persistence suspension", () => {
  afterEach(() => {
    markSessionPersistSettled();
  });

  it("resumes only after the final valid token and emits one commit event", () => {
    const onRuntimeChanged = vi.fn();
    window.addEventListener(SESSION_RUNTIME_CHANGED_EVENT, onRuntimeChanged);
    const first = suspendSessionPersist();
    const second = suspendSessionPersist();

    expect(isSessionPersistSuspended()).toBe(true);
    expect(resumeSessionPersist(Symbol("stale"))).toBe(false);
    expect(resumeSessionPersist(first)).toBe(true);
    expect(isSessionPersistSuspended()).toBe(true);
    expect(onRuntimeChanged).not.toHaveBeenCalled();

    expect(resumeSessionPersist(second)).toBe(true);
    expect(isSessionPersistSuspended()).toBe(false);
    expect(onRuntimeChanged).toHaveBeenCalledTimes(1);
    expect(resumeSessionPersist(second)).toBe(false);
    expect(onRuntimeChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_RUNTIME_CHANGED_EVENT, onRuntimeChanged);
  });
});
