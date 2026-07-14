from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVIDER_PATH = ROOT / "components/context/persisted-sessions.tsx"
HOOK_PATH = ROOT / "components/context/use-session-lifecycle.ts"
TEST_PATH = ROOT / "tests/session-lifecycle.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def remove_range(text: str, start_marker: str, end_marker: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        fail(f"Could not locate {label}.")
    end += len(end_marker)
    return text[:start] + text[end:]


def write_new(path: Path, content: str) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing file: {path.relative_to(ROOT)}")
    path.write_text(content, encoding="utf-8")


provider = PROVIDER_PATH.read_text(encoding="utf-8")
provider = replace_once(
    provider,
    '''import {
  dedupeResourceIds,
  fetchApi,
  fetchJson,
  readStoredResourceId,
  writeStoredResourceId,
} from "@/lib/client/persisted-resource-client";
''',
    '',
    'persisted resource client imports',
)
provider = replace_once(
    provider,
    '''import {
  patchSessionRequest,
  pickSessionId,
  recoverSessionDocumentFromCache,
  shouldKeepaliveSessionPatch,
  type ActiveSessionDocumentPatch,
  type SessionResponse,
} from "@/lib/client/session-persistence";
''',
    '''import {
  patchSessionRequest,
  shouldKeepaliveSessionPatch,
  type ActiveSessionDocumentPatch,
} from "@/lib/client/session-persistence";
''',
    'session persistence imports',
)
provider = replace_once(
    provider,
    'import { useSessionConflictResolution } from "@/components/context/use-session-conflict-resolution";\n',
    'import { useSessionConflictResolution } from "@/components/context/use-session-conflict-resolution";\nimport { useSessionLifecycle } from "@/components/context/use-session-lifecycle";\n',
    'session conflict hook import',
)
provider = replace_once(
    provider,
    '''type SessionsListResponse = {
  sessions: SessionSummary[];
};

''',
    '',
    'sessions list response type',
)
provider = replace_once(
    provider,
    '''const readStoredActiveSessionId = (userId: string | null) =>
  readStoredResourceId("session", userId, { urlParam: "sessionId" });

const writeStoredActiveSessionId = (
  userId: string | null,
  sessionId: string | null,
) => writeStoredResourceId("session", userId, sessionId);

''',
    '',
    'active session storage helpers',
)
provider = replace_once(
    provider,
    '  const [isReady, setIsReady] = React.useState(false);\n',
    '',
    'provider ready state',
)

conflict_block = '''  } = useSessionConflictResolution({
    activeSessionRef,
    updateKnownSession,
  });
'''
lifecycle_block = conflict_block + '''  const {
    archiveSession,
    createSession,
    deleteSession,
    deleteSessions,
    isReady,
    recoverMissingSession,
    selectSession,
  } = useSessionLifecycle({
    activeSessionRef,
    getKnownSession,
    prependSession,
    registerSessionConflict,
    sessionsRef,
    setActiveSession,
    setSessions,
    status,
    updateKnownSession,
    userId,
  });
'''
provider = replace_once(
    provider,
    conflict_block,
    lifecycle_block,
    'session conflict hook usage',
)
provider = remove_range(
    provider,
    '  const loadSession = React.useCallback(async (sessionId: string) => {\n',
    '  ]);\n\n',
    'session lifecycle callbacks',
)
PROVIDER_PATH.write_text(provider, encoding="utf-8")

write_new(
    HOOK_PATH,
    '''"use client";\n\nimport React from "react";\nimport {\n  dedupeResourceIds,\n  fetchApi,\n  fetchJson,\n  readStoredResourceId,\n  writeStoredResourceId,\n} from "@/lib/client/persisted-resource-client";\nimport {\n  patchSessionRequest,\n  pickSessionId,\n  recoverSessionDocumentFromCache,\n  type SessionDocumentPatch,\n  type SessionResponse,\n} from "@/lib/client/session-persistence";\nimport type { SessionDocument, SessionSummary } from "@/lib/session-documents";\n\ntype SessionStatus = "authenticated" | "loading" | "unauthenticated";\n\ntype UseSessionLifecycleOptions = {\n  activeSessionRef: React.RefObject<SessionDocument | null>;\n  getKnownSession: (sessionId: string) => SessionDocument | SessionSummary | null;\n  prependSession: (session: SessionDocument) => void;\n  registerSessionConflict: (\n    sessionId: string,\n    attemptedPatch: SessionDocumentPatch,\n    error: unknown,\n  ) => boolean;\n  sessionsRef: React.RefObject<SessionSummary[]>;\n  setActiveSession: (session: SessionDocument | null) => void;\n  setSessions: (update: React.SetStateAction<SessionSummary[]>) => void;\n  status: SessionStatus;\n  updateKnownSession: (session: SessionDocument) => void;\n  userId: string | null;\n};\n\ntype SessionsListResponse = {\n  sessions: SessionSummary[];\n};\n\nconst readStoredActiveSessionId = (userId: string | null) =>\n  readStoredResourceId("session", userId, { urlParam: "sessionId" });\n\nconst writeStoredActiveSessionId = (\n  userId: string | null,\n  sessionId: string | null,\n) => writeStoredResourceId("session", userId, sessionId);\n\nexport const filterRemovedSessions = (\n  sessions: SessionSummary[],\n  removedSessionIds: string[],\n) => {\n  const removed = new Set(removedSessionIds);\n  return sessions.filter((session) => !removed.has(session.id));\n};\n\nexport const isActiveSessionRemoved = (\n  activeSessionId: string | null | undefined,\n  removedSessionIds: string[],\n) => !!activeSessionId && removedSessionIds.includes(activeSessionId);\n\nexport function useSessionLifecycle({\n  activeSessionRef,\n  getKnownSession,\n  prependSession,\n  registerSessionConflict,\n  sessionsRef,\n  setActiveSession,\n  setSessions,\n  status,\n  updateKnownSession,\n  userId,\n}: UseSessionLifecycleOptions) {\n  const [isReady, setIsReady] = React.useState(false);\n\n  const loadSession = React.useCallback(\n    async (sessionId: string) => {\n      const data = await fetchJson<SessionResponse>(`/api/sessions/${sessionId}`);\n      const sessionDoc = await recoverSessionDocumentFromCache(\n        data.session,\n        registerSessionConflict,\n      );\n\n      setActiveSession(sessionDoc);\n      writeStoredActiveSessionId(userId, sessionDoc.id);\n      return sessionDoc;\n    },\n    [registerSessionConflict, setActiveSession, userId],\n  );\n\n  const refreshSessions = React.useCallback(async () => {\n    const data = await fetchJson<SessionsListResponse>(\n      "/api/sessions?includeArchived=1",\n    );\n    setSessions(data.sessions);\n    return data.sessions;\n  }, [setSessions]);\n\n  const createSession = React.useCallback(async () => {\n    setIsReady(false);\n    const data = await fetchJson<SessionResponse>("/api/sessions", {\n      method: "POST",\n      body: JSON.stringify({}),\n    });\n    prependSession(data.session);\n    setActiveSession(data.session);\n    writeStoredActiveSessionId(userId, data.session.id);\n    setIsReady(true);\n  }, [prependSession, setActiveSession, userId]);\n\n  const bootstrap = React.useCallback(async () => {\n    if (status === "loading") return;\n    if (!userId) {\n      setSessions([]);\n      setActiveSession(null);\n      setIsReady(true);\n      return;\n    }\n\n    setIsReady(false);\n    try {\n      const nextSessions = await refreshSessions();\n      if (nextSessions.length === 0) {\n        await createSession();\n        return;\n      }\n\n      const preferredId = pickSessionId(nextSessions, {\n        preferredId: readStoredActiveSessionId(userId),\n      });\n      if (!preferredId) {\n        setActiveSession(null);\n        writeStoredActiveSessionId(userId, null);\n        return;\n      }\n\n      try {\n        await loadSession(preferredId);\n      } catch {\n        const fallbackSessionId = pickSessionId(nextSessions, {\n          excludeIds: [preferredId],\n        });\n        if (fallbackSessionId) {\n          await loadSession(fallbackSessionId);\n        } else {\n          setActiveSession(null);\n          writeStoredActiveSessionId(userId, null);\n        }\n      }\n    } finally {\n      setIsReady(true);\n    }\n  }, [\n    createSession,\n    loadSession,\n    refreshSessions,\n    setActiveSession,\n    setSessions,\n    status,\n    userId,\n  ]);\n\n  React.useEffect(() => {\n    void bootstrap();\n  }, [bootstrap]);\n\n  const selectSession = React.useCallback(\n    async (sessionId: string) => {\n      setIsReady(false);\n      await loadSession(sessionId);\n      setIsReady(true);\n    },\n    [loadSession],\n  );\n\n  const archiveSession = React.useCallback(\n    async (sessionId: string) => {\n      const knownSession = getKnownSession(sessionId);\n      if (!knownSession) return;\n      const attemptedPatch = { archived: true };\n      let data: SessionResponse;\n      try {\n        data = await patchSessionRequest(\n          sessionId,\n          attemptedPatch,\n          knownSession.version,\n        );\n      } catch (error) {\n        if (registerSessionConflict(sessionId, attemptedPatch, error)) return;\n        throw error;\n      }\n      updateKnownSession(data.session);\n      const remaining = await refreshSessions();\n      if (activeSessionRef.current?.id !== sessionId) return;\n\n      const nextSessionId = pickSessionId(remaining, {\n        excludeIds: [sessionId],\n      });\n      if (nextSessionId) {\n        setIsReady(false);\n        try {\n          await loadSession(nextSessionId);\n          setIsReady(true);\n        } catch {\n          await createSession();\n        }\n        return;\n      }\n\n      setActiveSession(data.session);\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      createSession,\n      getKnownSession,\n      loadSession,\n      refreshSessions,\n      registerSessionConflict,\n      setActiveSession,\n      updateKnownSession,\n    ],\n  );\n\n  const deleteSessions = React.useCallback(\n    async (sessionIds: string[]) => {\n      const uniqueSessionIds = dedupeResourceIds(sessionIds);\n      if (uniqueSessionIds.length === 0) return;\n\n      await fetchApi(\n        "/api/sessions",\n        {\n          method: "DELETE",\n          body: JSON.stringify({ sessionIds: uniqueSessionIds }),\n        },\n        { allowedStatuses: [404] },\n      );\n\n      const remaining = await refreshSessions();\n      if (\n        !isActiveSessionRemoved(\n          activeSessionRef.current?.id,\n          uniqueSessionIds,\n        )\n      ) {\n        return;\n      }\n\n      const nextSessionId = pickSessionId(remaining, {\n        excludeIds: uniqueSessionIds,\n        preferredId: readStoredActiveSessionId(userId),\n      });\n      if (nextSessionId) {\n        setIsReady(false);\n        try {\n          await loadSession(nextSessionId);\n          setIsReady(true);\n        } catch {\n          await createSession();\n        }\n        return;\n      }\n\n      writeStoredActiveSessionId(userId, null);\n      setActiveSession(null);\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      createSession,\n      loadSession,\n      refreshSessions,\n      setActiveSession,\n      userId,\n    ],\n  );\n\n  const deleteSession = React.useCallback(\n    async (sessionId: string) => {\n      await deleteSessions([sessionId]);\n    },\n    [deleteSessions],\n  );\n\n  const recoverMissingSession = React.useCallback(\n    async (sessionId: string) => {\n      let remaining: SessionSummary[] = [];\n      try {\n        remaining = await refreshSessions();\n      } catch {\n        setSessions((current) =>\n          filterRemovedSessions(current, [sessionId]),\n        );\n      }\n\n      const visibleSessions = filterRemovedSessions(remaining, [sessionId]);\n      if (remaining.length > 0) setSessions(visibleSessions);\n      if (activeSessionRef.current?.id !== sessionId) return;\n\n      const nextSessionId = pickSessionId(visibleSessions, {\n        preferredId: readStoredActiveSessionId(userId),\n      });\n      if (nextSessionId) {\n        setIsReady(false);\n        try {\n          await loadSession(nextSessionId);\n        } catch {\n          writeStoredActiveSessionId(userId, null);\n          setActiveSession(null);\n          await createSession();\n        } finally {\n          setIsReady(true);\n        }\n        return;\n      }\n\n      writeStoredActiveSessionId(userId, null);\n      setActiveSession(null);\n      await createSession();\n    },\n    [\n      activeSessionRef,\n      createSession,\n      loadSession,\n      refreshSessions,\n      setActiveSession,\n      setSessions,\n      userId,\n    ],\n  );\n\n  return {\n    archiveSession,\n    createSession,\n    deleteSession,\n    deleteSessions,\n    isReady,\n    recoverMissingSession,\n    selectSession,\n  };\n}\n''',
)

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport {\n  filterRemovedSessions,\n  isActiveSessionRemoved,\n} from "@/components/context/use-session-lifecycle";\nimport type { SessionSummary } from "@/lib/session-documents";\n\nconst summary = (id: string): SessionSummary => ({\n  archived: false,\n  createdAt: "2026-01-01T00:00:00.000Z",\n  id,\n  messageCount: 0,\n  title: null,\n  updatedAt: "2026-01-01T00:00:00.000Z",\n  version: 1,\n});\n\ndescribe("session lifecycle helpers", () => {\n  it("filters every removed session while preserving list order", () => {\n    expect(\n      filterRemovedSessions(\n        [summary("a"), summary("b"), summary("c")],\n        ["b", "missing"],\n      ).map((session) => session.id),\n    ).toEqual(["a", "c"]);\n  });\n\n  it("detects only when the active session is part of the removed set", () => {\n    expect(isActiveSessionRemoved("b", ["a", "b"])).toBe(true);\n    expect(isActiveSessionRemoved("c", ["a", "b"])).toBe(false);\n    expect(isActiveSessionRemoved(null, ["a"])).toBe(false);\n  });\n});\n''',
)

print("Session lifecycle extraction prepared successfully.")
