from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT_PATH = ROOT / "lib/client/persisted-resource-client.ts"
STATE_PATH = ROOT / "components/context/use-persisted-resource-state.ts"
LIFECYCLE_PATH = ROOT / "components/context/use-session-lifecycle.ts"
CONFLICT_PATH = ROOT / "components/context/use-session-conflict-resolution.ts"
ORCHESTRATION_PATH = ROOT / "lib/client/session-orchestration.ts"
ORCHESTRATION_TEST_PATH = ROOT / "tests/session-orchestration.test.ts"
QUEUE_TEST_PATH = ROOT / "tests/serial-task-queue.test.ts"
CONFLICT_TEST_PATH = ROOT / "tests/session-conflict-handling.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def replace_range(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        fail(f"Could not locate {label}.")
    return text[:start] + replacement + text[end:]


def write_new(path: Path, content: str) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing file: {path.relative_to(ROOT)}")
    path.write_text(content, encoding="utf-8")


write_new(
    ORCHESTRATION_PATH,
    '''import type { SessionSummary } from "@/lib/session-documents";\nimport { pickSessionId } from "@/lib/client/session-persistence";\n\nexport type SessionLifecycleDecision =\n  | { type: "clear" }\n  | { type: "create" }\n  | { type: "keep" }\n  | { sessionId: string; type: "load" };\n\ntype SessionRemovalDecisionOptions = {\n  activeSessionId: string | null | undefined;\n  preferredId?: string | null;\n  remainingSessions: SessionSummary[];\n  removedSessionIds: string[];\n};\n\ntype MissingSessionDecisionOptions = {\n  activeSessionId: string | null | undefined;\n  missingSessionId: string;\n  preferredId?: string | null;\n  visibleSessions: SessionSummary[];\n};\n\nconst loadOr = (sessionId: string | null, fallback: "clear" | "create"):\n  SessionLifecycleDecision =>\n  sessionId ? { sessionId, type: "load" } : { type: fallback };\n\nexport function decideSessionBootstrap(\n  sessions: SessionSummary[],\n  preferredId?: string | null,\n): SessionLifecycleDecision {\n  if (sessions.length === 0) return { type: "create" };\n  return loadOr(pickSessionId(sessions, { preferredId }), "clear");\n}\n\nexport function decideSessionLoadFailure(\n  sessions: SessionSummary[],\n  failedSessionId: string,\n): SessionLifecycleDecision {\n  return loadOr(\n    pickSessionId(sessions, { excludeIds: [failedSessionId] }),\n    "clear",\n  );\n}\n\nexport function decideAfterSessionRemoval({\n  activeSessionId,\n  preferredId,\n  remainingSessions,\n  removedSessionIds,\n}: SessionRemovalDecisionOptions): SessionLifecycleDecision {\n  if (!activeSessionId || !removedSessionIds.includes(activeSessionId)) {\n    return { type: "keep" };\n  }\n  return loadOr(\n    pickSessionId(remainingSessions, {\n      excludeIds: removedSessionIds,\n      preferredId,\n    }),\n    "create",\n  );\n}\n\nexport function decideMissingSessionRecovery({\n  activeSessionId,\n  missingSessionId,\n  preferredId,\n  visibleSessions,\n}: MissingSessionDecisionOptions): SessionLifecycleDecision {\n  if (activeSessionId !== missingSessionId) return { type: "keep" };\n  return loadOr(\n    pickSessionId(visibleSessions, { preferredId }),\n    "create",\n  );\n}\n''',
)

client = CLIENT_PATH.read_text(encoding="utf-8")
client = replace_once(
    client,
    '''export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {\n  const response = await fetchApi(input, init);\n  return (await response.json()) as T;\n}\n\n''',
    '''export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {\n  const response = await fetchApi(input, init);\n  return (await response.json()) as T;\n}\n\nexport function createSerialTaskQueue<T>(fallback: T) {\n  let queue = Promise.resolve(fallback);\n\n  return (task: () => Promise<T>) => {\n    const next = queue.then(task, task);\n    queue = next.catch(() => fallback);\n    return next;\n  };\n}\n\n''',
    "serial task queue insertion",
)
CLIENT_PATH.write_text(client, encoding="utf-8")

state = STATE_PATH.read_text(encoding="utf-8")
state = replace_once(
    state,
    '''import {\n  prependUniqueResource,\n  replaceResourceById,\n} from "@/lib/client/persisted-resource-client";\n''',
    '''import {\n  createSerialTaskQueue,\n  prependUniqueResource,\n  replaceResourceById,\n} from "@/lib/client/persisted-resource-client";\n''',
    "persisted resource imports",
)
state = replace_once(
    state,
    '''export function useSerialTaskQueue<T>(fallback: T) {\n  const queueRef = React.useRef<Promise<T>>(Promise.resolve(fallback));\n\n  return React.useCallback(\n    (task: () => Promise<T>) => {\n      const next = queueRef.current.then(task, task);\n      queueRef.current = next.catch(() => fallback);\n      return next;\n    },\n    [fallback],\n  );\n}\n''',
    '''export function useSerialTaskQueue<T>(fallback: T) {\n  const queue = React.useMemo(() => createSerialTaskQueue(fallback), [fallback]);\n  return React.useCallback((task: () => Promise<T>) => queue(task), [queue]);\n}\n''',
    "serial task queue hook",
)
STATE_PATH.write_text(state, encoding="utf-8")

conflict = CONFLICT_PATH.read_text(encoding="utf-8")
conflict = replace_once(
    conflict,
    '''type UseSessionConflictResolutionOptions = {\n  activeSessionRef: React.RefObject<SessionDocument | null>;\n  updateKnownSession: (session: SessionDocument) => void;\n};\n\n''',
    '''type UseSessionConflictResolutionOptions = {\n  activeSessionRef: React.RefObject<SessionDocument | null>;\n  updateKnownSession: (session: SessionDocument) => void;\n};\n\nexport const matchesSessionConflict = (\n  conflict: SessionConflictState | null,\n  sessionId: string,\n) => conflict?.sessionId === sessionId;\n\n''',
    "session conflict matcher",
)
conflict = replace_range(
    conflict,
    '  const hasSessionConflict = React.useCallback(\n',
    '  const loadLatestConflictVersion = React.useCallback(() => {\n',
    '''  const hasSessionConflict = React.useCallback(\n    (sessionId: string) =>\n      matchesSessionConflict(sessionConflictRef.current, sessionId),\n    [],\n  );\n\n  const loadLatestConflictVersion = React.useCallback(() => {\n''',
    "session conflict lookup callback",
)
CONFLICT_PATH.write_text(conflict, encoding="utf-8")

lifecycle = LIFECYCLE_PATH.read_text(encoding="utf-8")
lifecycle = replace_once(
    lifecycle,
    '''import {\n  patchSessionRequest,\n  pickSessionId,\n  recoverSessionDocumentFromCache,\n  type SessionDocumentPatch,\n  type SessionResponse,\n} from "@/lib/client/session-persistence";\n''',
    '''import {\n  patchSessionRequest,\n  recoverSessionDocumentFromCache,\n  type SessionDocumentPatch,\n  type SessionResponse,\n} from "@/lib/client/session-persistence";\nimport {\n  decideAfterSessionRemoval,\n  decideMissingSessionRecovery,\n  decideSessionBootstrap,\n  decideSessionLoadFailure,\n} from "@/lib/client/session-orchestration";\n''',
    "session lifecycle imports",
)
lifecycle = replace_once(
    lifecycle,
    '''  const bootstrap = React.useCallback(async () => {\n    if (status === "loading") return;\n    if (!userId) {\n      setSessions([]);\n      setActiveSession(null);\n      setIsReady(true);\n      return;\n    }\n\n    setIsReady(false);\n    try {\n      const nextSessions = await refreshSessions();\n      if (nextSessions.length === 0) {\n        await createSession();\n        return;\n      }\n\n      const preferredId = pickSessionId(nextSessions, {\n        preferredId: readStoredActiveSessionId(userId),\n      });\n      if (!preferredId) {\n        setActiveSession(null);\n        writeStoredActiveSessionId(userId, null);\n        return;\n      }\n\n      try {\n        await loadSession(preferredId);\n      } catch {\n        const fallbackSessionId = pickSessionId(nextSessions, {\n          excludeIds: [preferredId],\n        });\n        if (fallbackSessionId) {\n          await loadSession(fallbackSessionId);\n        } else {\n          setActiveSession(null);\n          writeStoredActiveSessionId(userId, null);\n        }\n      }\n    } finally {\n      setIsReady(true);\n    }\n  }, [\n    createSession,\n    loadSession,\n    refreshSessions,\n    setActiveSession,\n    setSessions,\n    status,\n    userId,\n  ]);\n''',
    '''  const clearActiveSession = React.useCallback(() => {\n    writeStoredActiveSessionId(userId, null);\n    setActiveSession(null);\n  }, [setActiveSession, userId]);\n\n  const bootstrap = React.useCallback(async () => {\n    if (status === "loading") return;\n    if (!userId) {\n      setSessions([]);\n      setActiveSession(null);\n      setIsReady(true);\n      return;\n    }\n\n    setIsReady(false);\n    try {\n      const nextSessions = await refreshSessions();\n      const decision = decideSessionBootstrap(\n        nextSessions,\n        readStoredActiveSessionId(userId),\n      );\n      if (decision.type === "create") {\n        await createSession();\n        return;\n      }\n      if (decision.type === "clear") {\n        clearActiveSession();\n        return;\n      }\n      if (decision.type !== "load") return;\n\n      try {\n        await loadSession(decision.sessionId);\n      } catch {\n        const fallback = decideSessionLoadFailure(\n          nextSessions,\n          decision.sessionId,\n        );\n        if (fallback.type === "load") {\n          await loadSession(fallback.sessionId);\n        } else {\n          clearActiveSession();\n        }\n      }\n    } finally {\n      setIsReady(true);\n    }\n  }, [\n    clearActiveSession,\n    createSession,\n    loadSession,\n    refreshSessions,\n    setActiveSession,\n    setSessions,\n    status,\n    userId,\n  ]);\n''',
    "session bootstrap orchestration",
)

archive_start = '  const archiveSession = React.useCallback(\n'
delete_start = '  const deleteSessions = React.useCallback(\n'
archive_replacement = '''  const archiveSession = React.useCallback(\n    async (sessionId: string) => {\n      const knownSession = getKnownSession(sessionId);\n      if (!knownSession) return;\n      const attemptedPatch = { archived: true };\n      let data: SessionResponse;\n      try {\n        data = await patchSessionRequest(\n          sessionId,\n          attemptedPatch,\n          knownSession.version,\n        );\n      } catch (error) {\n        if (registerSessionConflict(sessionId, attemptedPatch, error)) return;\n        throw error;\n      }\n      updateKnownSession(data.session);\n      const remaining = await refreshSessions();\n      const decision = decideAfterSessionRemoval({\n        activeSessionId: activeSessionRef.current?.id,\n        remainingSessions: remaining,\n        removedSessionIds: [sessionId],\n      });\n      if (decision.type === "keep") return;\n      if (decision.type === "load") {\n        setIsReady(false);\n        try {\n          await loadSession(decision.sessionId);\n          setIsReady(true);\n        } catch {\n          await createSession();\n        }\n        return;\n      }\n\n      setActiveSession(data.session);\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      createSession,\n      getKnownSession,\n      loadSession,\n      refreshSessions,\n      registerSessionConflict,\n      setActiveSession,\n      updateKnownSession,\n    ],\n  );\n\n'''
lifecycle = replace_range(
    lifecycle,
    archive_start,
    delete_start,
    archive_replacement,
    "archive session callback",
)

delete_start = '  const deleteSessions = React.useCallback(\n'
delete_single_start = '  const deleteSession = React.useCallback(\n'
delete_replacement = '''  const deleteSessions = React.useCallback(\n    async (sessionIds: string[]) => {\n      const uniqueSessionIds = dedupeResourceIds(sessionIds);\n      if (uniqueSessionIds.length === 0) return;\n\n      await fetchApi(\n        "/api/sessions",\n        {\n          method: "DELETE",\n          body: JSON.stringify({ sessionIds: uniqueSessionIds }),\n        },\n        { allowedStatuses: [404] },\n      );\n\n      const remaining = await refreshSessions();\n      const decision = decideAfterSessionRemoval({\n        activeSessionId: activeSessionRef.current?.id,\n        preferredId: readStoredActiveSessionId(userId),\n        remainingSessions: remaining,\n        removedSessionIds: uniqueSessionIds,\n      });\n      if (decision.type === "keep") return;\n      if (decision.type === "load") {\n        setIsReady(false);\n        try {\n          await loadSession(decision.sessionId);\n          setIsReady(true);\n        } catch {\n          await createSession();\n        }\n        return;\n      }\n\n      clearActiveSession();\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      clearActiveSession,\n      createSession,\n      loadSession,\n      refreshSessions,\n      userId,\n    ],\n  );\n\n'''
lifecycle = replace_range(
    lifecycle,
    delete_start,
    delete_single_start,
    delete_replacement,
    "delete sessions callback",
)

recover_start = '  const recoverMissingSession = React.useCallback(\n'
return_start = '  return {\n'
recover_replacement = '''  const recoverMissingSession = React.useCallback(\n    async (sessionId: string) => {\n      let remaining: SessionSummary[] = [];\n      try {\n        remaining = await refreshSessions();\n      } catch {\n        remaining = filterRemovedSessions(sessionsRef.current, [sessionId]);\n        setSessions(remaining);\n      }\n\n      const visibleSessions = filterRemovedSessions(remaining, [sessionId]);\n      if (remaining.length > 0) setSessions(visibleSessions);\n      const decision = decideMissingSessionRecovery({\n        activeSessionId: activeSessionRef.current?.id,\n        missingSessionId: sessionId,\n        preferredId: readStoredActiveSessionId(userId),\n        visibleSessions,\n      });\n      if (decision.type === "keep") return;\n      if (decision.type === "load") {\n        setIsReady(false);\n        try {\n          await loadSession(decision.sessionId);\n        } catch {\n          clearActiveSession();\n          await createSession();\n        } finally {\n          setIsReady(true);\n        }\n        return;\n      }\n\n      clearActiveSession();\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      clearActiveSession,\n      createSession,\n      loadSession,\n      refreshSessions,\n      sessionsRef,\n      setSessions,\n      userId,\n    ],\n  );\n\n'''
lifecycle = replace_range(
    lifecycle,
    recover_start,
    return_start,
    recover_replacement,
    "missing session recovery callback",
)
LIFECYCLE_PATH.write_text(lifecycle, encoding="utf-8")

write_new(
    ORCHESTRATION_TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport {\n  decideAfterSessionRemoval,\n  decideMissingSessionRecovery,\n  decideSessionBootstrap,\n  decideSessionLoadFailure,\n} from "@/lib/client/session-orchestration";\nimport type { SessionSummary } from "@/lib/session-documents";\n\nconst session = (id: string, archived = false): SessionSummary => ({\n  archived,\n  createdAt: "2026-01-01T00:00:00.000Z",\n  id,\n  messageCount: 0,\n  title: null,\n  updatedAt: "2026-01-01T00:00:00.000Z",\n  version: 1,\n});\n\ndescribe("session orchestration decisions", () => {\n  it("creates during bootstrap when the account has no sessions", () => {\n    expect(decideSessionBootstrap([])).toEqual({ type: "create" });\n  });\n\n  it("loads the preferred session and otherwise the first visible session", () => {\n    const sessions = [session("archived", true), session("active")];\n    expect(decideSessionBootstrap(sessions, "archived")).toEqual({\n      sessionId: "archived",\n      type: "load",\n    });\n    expect(decideSessionBootstrap(sessions)).toEqual({\n      sessionId: "active",\n      type: "load",\n    });\n  });\n\n  it("falls back after a load error and clears when no fallback exists", () => {\n    const sessions = [session("first"), session("second")];\n    expect(decideSessionLoadFailure(sessions, "first")).toEqual({\n      sessionId: "second",\n      type: "load",\n    });\n    expect(decideSessionLoadFailure([session("only")], "only")).toEqual({\n      type: "clear",\n    });\n  });\n\n  it("keeps the current session when a different session is removed", () => {\n    expect(\n      decideAfterSessionRemoval({\n        activeSessionId: "active",\n        remainingSessions: [session("active")],\n        removedSessionIds: ["other"],\n      }),\n    ).toEqual({ type: "keep" });\n  });\n\n  it("loads a preferred remaining session after deleting the active one", () => {\n    expect(\n      decideAfterSessionRemoval({\n        activeSessionId: "deleted",\n        preferredId: "preferred",\n        remainingSessions: [session("fallback"), session("preferred")],\n        removedSessionIds: ["deleted"],\n      }),\n    ).toEqual({ sessionId: "preferred", type: "load" });\n  });\n\n  it("creates a replacement when removing the active session leaves none", () => {\n    expect(\n      decideAfterSessionRemoval({\n        activeSessionId: "deleted",\n        remainingSessions: [],\n        removedSessionIds: ["deleted"],\n      }),\n    ).toEqual({ type: "create" });\n  });\n\n  it("recovers only when the missing session is active", () => {\n    expect(\n      decideMissingSessionRecovery({\n        activeSessionId: "active",\n        missingSessionId: "other",\n        visibleSessions: [session("active")],\n      }),\n    ).toEqual({ type: "keep" });\n    expect(\n      decideMissingSessionRecovery({\n        activeSessionId: "missing",\n        missingSessionId: "missing",\n        visibleSessions: [session("fallback")],\n      }),\n    ).toEqual({ sessionId: "fallback", type: "load" });\n    expect(\n      decideMissingSessionRecovery({\n        activeSessionId: "missing",\n        missingSessionId: "missing",\n        visibleSessions: [],\n      }),\n    ).toEqual({ type: "create" });\n  });\n});\n''',
)

write_new(
    QUEUE_TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { createSerialTaskQueue } from "@/lib/client/persisted-resource-client";\n\ndescribe("createSerialTaskQueue", () => {\n  it("runs tasks strictly in submission order", async () => {\n    const events: string[] = [];\n    let releaseFirst: () => void = () => undefined;\n    const firstGate = new Promise<void>((resolve) => {\n      releaseFirst = resolve;\n    });\n    const enqueue = createSerialTaskQueue<string>("fallback");\n\n    const first = enqueue(async () => {\n      events.push("first:start");\n      await firstGate;\n      events.push("first:end");\n      return "first";\n    });\n    const second = enqueue(async () => {\n      events.push("second");\n      return "second";\n    });\n\n    await Promise.resolve();\n    expect(events).toEqual(["first:start"]);\n    releaseFirst();\n    await expect(first).resolves.toBe("first");\n    await expect(second).resolves.toBe("second");\n    expect(events).toEqual(["first:start", "first:end", "second"]);\n  });\n\n  it("continues processing after a rejected task", async () => {\n    const enqueue = createSerialTaskQueue<number>(0);\n    await expect(\n      enqueue(async () => {\n        throw new Error("save failed");\n      }),\n    ).rejects.toThrow("save failed");\n    await expect(enqueue(async () => 42)).resolves.toBe(42);\n  });\n});\n''',
)

write_new(
    CONFLICT_TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport { matchesSessionConflict } from "@/components/context/use-session-conflict-resolution";\nimport { readSessionConflictResponse } from "@/lib/client/session-persistence";\nimport { SESSION_VERSION_CONFLICT_CODE } from "@/lib/session-version-conflict";\nimport type { SessionDocument } from "@/lib/session-documents";\n\nconst currentSession: SessionDocument = {\n  archived: false,\n  artifacts: [],\n  contextLinks: [],\n  createdAt: "2026-01-01T00:00:00.000Z",\n  id: "session-1",\n  messageCount: 0,\n  snapshot: { headId: null, messages: [] },\n  title: null,\n  updatedAt: "2026-01-01T00:00:00.000Z",\n  version: 2,\n};\n\nconst conflictError = (payload: unknown, status = 409) =>\n  Object.assign(new Error("request failed"), { payload, status });\n\ndescribe("session conflict handling", () => {\n  it("parses a valid version-conflict response", () => {\n    const parsed = readSessionConflictResponse(\n      conflictError({\n        code: SESSION_VERSION_CONFLICT_CODE,\n        error: "changed elsewhere",\n        expectedVersion: 1,\n        session: currentSession,\n      }),\n    );\n    expect(parsed?.session).toEqual(currentSession);\n    expect(parsed?.expectedVersion).toBe(1);\n  });\n\n  it("rejects unrelated statuses and malformed conflict payloads", () => {\n    expect(readSessionConflictResponse(conflictError({}, 500))).toBeNull();\n    expect(\n      readSessionConflictResponse(\n        conflictError({ code: "other", session: currentSession }),\n      ),\n    ).toBeNull();\n    expect(\n      readSessionConflictResponse(\n        conflictError({ code: SESSION_VERSION_CONFLICT_CODE, session: {} }),\n      ),\n    ).toBeNull();\n  });\n\n  it("matches conflicts only to their owning session", () => {\n    const conflict = {\n      attemptedPatch: { title: "local" },\n      currentSession,\n      sessionId: currentSession.id,\n    };\n    expect(matchesSessionConflict(conflict, "session-1")).toBe(true);\n    expect(matchesSessionConflict(conflict, "session-2")).toBe(false);\n    expect(matchesSessionConflict(null, "session-1")).toBe(false);\n  });\n});\n''',
)

print("Session orchestration coverage prepared successfully.")
