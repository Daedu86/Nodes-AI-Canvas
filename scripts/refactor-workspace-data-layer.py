from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SESSIONS_PATH = ROOT / "components/context/persisted-sessions.tsx"
PROJECTS_PATH = ROOT / "components/context/projects.tsx"
STATE_HOOK_PATH = ROOT / "components/context/use-persisted-resource-state.ts"
CLIENT_PATH = ROOT / "lib/client/persisted-resource-client.ts"
TEST_PATH = ROOT / "tests/persisted-resource-client.test.ts"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"Expected exactly one {label}, found {count}.")
    return text.replace(old, new, 1)


def remove_once(text: str, old: str, label: str) -> str:
    return replace_once(text, old, "", label)


def write_new(path: Path, content: str) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing file: {path.relative_to(ROOT)}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


write_new(
    CLIENT_PATH,
    '''export type ClientHttpError = Error & {\n  payload?: unknown;\n  status?: number;\n};\n\ntype FetchApiOptions = {\n  allowedStatuses?: number[];\n};\n\ntype StoredResourceIdOptions = {\n  urlParam?: string;\n};\n\nconst buildJsonHeaders = (headers?: HeadersInit) => ({\n  "Content-Type": "application/json",\n  ...(headers ?? {}),\n});\n\nexport async function fetchApi(\n  input: RequestInfo | URL,\n  init?: RequestInit,\n  options?: FetchApiOptions,\n) {\n  const response = await fetch(input, {\n    ...init,\n    headers: buildJsonHeaders(init?.headers),\n  });\n  if (response.ok || options?.allowedStatuses?.includes(response.status)) {\n    return response;\n  }\n\n  const error = new Error(`Request failed: ${response.status}`) as ClientHttpError;\n  error.status = response.status;\n  error.payload = await response.json().catch(() => null);\n  throw error;\n}\n\nexport async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {\n  const response = await fetchApi(input, init);\n  return (await response.json()) as T;\n}\n\nexport const buildActiveResourceStorageKey = (\n  resourceName: string,\n  userId: string | null,\n) =>\n  userId\n    ? `nodes.active-${resourceName}-id.${userId}`\n    : `nodes.active-${resourceName}-id.v1`;\n\nexport const readStoredResourceId = (\n  resourceName: string,\n  userId: string | null,\n  options?: StoredResourceIdOptions,\n) => {\n  try {\n    const urlValue = options?.urlParam\n      ? new URLSearchParams(window.location.search).get(options.urlParam)\n      : null;\n    if (urlValue && urlValue.length > 0) return urlValue;\n    return localStorage.getItem(buildActiveResourceStorageKey(resourceName, userId));\n  } catch {\n    return null;\n  }\n};\n\nexport const writeStoredResourceId = (\n  resourceName: string,\n  userId: string | null,\n  resourceId: string | null,\n) => {\n  try {\n    const storageKey = buildActiveResourceStorageKey(resourceName, userId);\n    if (!resourceId) {\n      localStorage.removeItem(storageKey);\n      return;\n    }\n    localStorage.setItem(storageKey, resourceId);\n  } catch {\n    // ignore storage errors\n  }\n};\n\nexport const dedupeResourceIds = (resourceIds: string[]) =>\n  [...new Set(resourceIds)].filter((resourceId) => resourceId.length > 0);\n\nexport function replaceResourceById<T extends { id: string }>(\n  resources: T[],\n  resource: T,\n) {\n  return resources.map((item) => (item.id === resource.id ? resource : item));\n}\n\nexport function prependUniqueResource<T extends { id: string }>(\n  resources: T[],\n  resource: T,\n) {\n  return [resource, ...resources.filter((item) => item.id !== resource.id)];\n}\n''',
)

write_new(
    STATE_HOOK_PATH,
    '''"use client";\n\nimport React from "react";\nimport {\n  prependUniqueResource,\n  replaceResourceById,\n} from "@/lib/client/persisted-resource-client";\n\ntype ResourceWithId = { id: string };\n\nexport function usePersistedResourceState<\n  TSummary extends ResourceWithId,\n  TDocument extends TSummary,\n>() {\n  const [resources, setResourcesState] = React.useState<TSummary[]>([]);\n  const [activeResource, setActiveResourceState] =\n    React.useState<TDocument | null>(null);\n  const resourcesRef = React.useRef<TSummary[]>([]);\n  const activeResourceRef = React.useRef<TDocument | null>(null);\n\n  const setResources = React.useCallback(\n    (update: React.SetStateAction<TSummary[]>) => {\n      setResourcesState((previous) => {\n        const next =\n          typeof update === "function"\n            ? (update as (value: TSummary[]) => TSummary[])(previous)\n            : update;\n        resourcesRef.current = next;\n        return next;\n      });\n    },\n    [],\n  );\n\n  const setActiveResource = React.useCallback((resource: TDocument | null) => {\n    activeResourceRef.current = resource;\n    setActiveResourceState(resource);\n  }, []);\n\n  const updateKnownResource = React.useCallback(\n    (resource: TDocument) => {\n      setResources((previous) => replaceResourceById(previous, resource));\n      if (activeResourceRef.current?.id === resource.id) {\n        setActiveResource(resource);\n      }\n    },\n    [setActiveResource, setResources],\n  );\n\n  const prependResource = React.useCallback(\n    (resource: TDocument) => {\n      setResources((previous) => prependUniqueResource(previous, resource));\n    },\n    [setResources],\n  );\n\n  const getKnownResource = React.useCallback((resourceId: string) => {\n    if (activeResourceRef.current?.id === resourceId) {\n      return activeResourceRef.current;\n    }\n    return resourcesRef.current.find((item) => item.id === resourceId) ?? null;\n  }, []);\n\n  return {\n    activeResource,\n    activeResourceRef,\n    getKnownResource,\n    prependResource,\n    resources,\n    resourcesRef,\n    setActiveResource,\n    setResources,\n    updateKnownResource,\n  };\n}\n\nexport function useSerialTaskQueue<T>(fallback: T) {\n  const queueRef = React.useRef<Promise<T>>(Promise.resolve(fallback));\n\n  return React.useCallback(\n    (task: () => Promise<T>) => {\n      const next = queueRef.current.then(task, task);\n      queueRef.current = next.catch(() => fallback);\n      return next;\n    },\n    [fallback],\n  );\n}\n''',
)

sessions = SESSIONS_PATH.read_text(encoding="utf-8")
sessions = replace_once(
    sessions,
    'import React from "react";\n',
    'import React from "react";\nimport {\n  dedupeResourceIds,\n  fetchApi,\n  fetchJson,\n  readStoredResourceId,\n  writeStoredResourceId,\n} from "@/lib/client/persisted-resource-client";\nimport {\n  usePersistedResourceState,\n  useSerialTaskQueue,\n} from "@/components/context/use-persisted-resource-state";\n',
    'sessions React import',
)
sessions = remove_once(
    sessions,
    '''type HttpError = Error & {\n  payload?: unknown;\n  status?: number;\n};\n\n''',
    'sessions HTTP error type',
)
sessions = remove_once(
    sessions,
    '''const SESSION_SNAPSHOT_CACHE_KEY_PREFIX = "nodes.session-snapshot-cache.v1:";\n\n''',
    'session snapshot prefix declaration',
)
sessions = replace_once(
    sessions,
    '''const buildActiveSessionKey = (userId: string | null) =>\n  userId ? `nodes.active-session-id.${userId}` : "nodes.active-session-id.v1";\nconst KEEPALIVE_SAFE_BODY_BYTES = 60 * 1024;\n''',
    '''const SESSION_SNAPSHOT_CACHE_KEY_PREFIX = "nodes.session-snapshot-cache.v1:";\nconst KEEPALIVE_SAFE_BODY_BYTES = 60 * 1024;\n''',
    'active session storage key',
)
sessions = replace_once(
    sessions,
    '''const readStoredActiveSessionId = (userId: string | null) => {\n  try {\n    const urlSessionId = new URLSearchParams(window.location.search).get("sessionId");\n    if (urlSessionId && urlSessionId.length > 0) {\n      return urlSessionId;\n    }\n    return localStorage.getItem(buildActiveSessionKey(userId));\n  } catch {\n    return null;\n  }\n};\n\nconst writeStoredActiveSessionId = (userId: string | null, sessionId: string | null) => {\n  try {\n    const storageKey = buildActiveSessionKey(userId);\n    if (!sessionId) {\n      localStorage.removeItem(storageKey);\n      return;\n    }\n    localStorage.setItem(storageKey, sessionId);\n  } catch {\n    // ignore storage errors\n  }\n};\n\n''',
    '''const readStoredActiveSessionId = (userId: string | null) =>\n  readStoredResourceId("session", userId, { urlParam: "sessionId" });\n\nconst writeStoredActiveSessionId = (\n  userId: string | null,\n  sessionId: string | null,\n) => writeStoredResourceId("session", userId, sessionId);\n\n''',
    'session storage helpers',
)
sessions = remove_once(
    sessions,
    '''async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {\n  const response = await fetch(input, {\n    headers: {\n      "Content-Type": "application/json",\n      ...(init?.headers ?? {}),\n    },\n    ...init,\n  });\n  if (!response.ok) {\n    const error = new Error(`Request failed: ${response.status}`) as HttpError;\n    error.status = response.status;\n    error.payload = await response.json().catch(() => null);\n    throw error;\n  }\n  return (await response.json()) as T;\n}\n\n''',
    'sessions fetchJson',
)
sessions = replace_once(
    sessions,
    '''  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);\n  const [activeSession, setActiveSession] = React.useState<SessionDocument | null>(null);\n  const [isReady, setIsReady] = React.useState(false);\n  const [sessionConflict, setSessionConflict] = React.useState<SessionConflictState | null>(null);\n  const [isResolvingConflict, setIsResolvingConflict] = React.useState(false);\n  const activeSessionRef = React.useRef<SessionDocument | null>(null);\n  const sessionsRef = React.useRef<SessionSummary[]>([]);\n  const sessionConflictRef = React.useRef<SessionConflictState | null>(null);\n  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());\n\n  React.useEffect(() => {\n    activeSessionRef.current = activeSession;\n  }, [activeSession]);\n\n  React.useEffect(() => {\n    sessionsRef.current = sessions;\n  }, [sessions]);\n\n''',
    '''  const {\n    activeResource: activeSession,\n    activeResourceRef: activeSessionRef,\n    getKnownResource: getKnownSession,\n    prependResource: prependSession,\n    resources: sessions,\n    resourcesRef: sessionsRef,\n    setActiveResource: setActiveSession,\n    setResources: setSessions,\n    updateKnownResource: updateKnownSession,\n  } = usePersistedResourceState<SessionSummary, SessionDocument>();\n  const enqueueSessionSave = useSerialTaskQueue<void>(undefined);\n  const [isReady, setIsReady] = React.useState(false);\n  const [sessionConflict, setSessionConflict] = React.useState<SessionConflictState | null>(null);\n  const [isResolvingConflict, setIsResolvingConflict] = React.useState(false);\n  const sessionConflictRef = React.useRef<SessionConflictState | null>(null);\n\n''',
    'sessions state setup',
)
sessions = remove_once(
    sessions,
    '''  const updateKnownSession = React.useCallback((sessionDoc: SessionDocument) => {\n    setSessions((prev) => {\n      const next = prev.map((item) => (item.id === sessionDoc.id ? sessionDoc : item));\n      sessionsRef.current = next;\n      return next;\n    });\n    if (activeSessionRef.current?.id === sessionDoc.id) {\n      activeSessionRef.current = sessionDoc;\n      setActiveSession(sessionDoc);\n    }\n  }, []);\n\n''',
    'updateKnownSession callback',
)
sessions = remove_once(
    sessions,
    '''  const getKnownSession = React.useCallback((sessionId: string) => {\n    if (activeSessionRef.current?.id === sessionId) {\n      return activeSessionRef.current;\n    }\n    return sessionsRef.current.find((item) => item.id === sessionId) ?? null;\n  }, []);\n\n''',
    'getKnownSession callback',
)
# Ref-aware setters now update their refs synchronously.
sessions = re.sub(
    r'(?m)^(\s*)activeSessionRef\.current = ([^\n;]+);\n\1setActiveSession\(\2\);',
    r'\1setActiveSession(\2);',
    sessions,
)
sessions = re.sub(
    r'(?m)^(\s*)sessionsRef\.current = ([^\n;]+);\n\1setSessions\(\2\);',
    r'\1setSessions(\2);',
    sessions,
)
sessions = replace_once(
    sessions,
    '''    const nextSessions = [data.session, ...sessionsRef.current];\n    setSessions(nextSessions);\n    setActiveSession(data.session);\n''',
    '''    prependSession(data.session);\n    setActiveSession(data.session);\n''',
    'create session collection update',
)
sessions = replace_once(
    sessions,
    '''    const uniqueSessionIds = [...new Set(sessionIds)].filter((sessionId) => sessionId.length > 0);\n''',
    '''    const uniqueSessionIds = dedupeResourceIds(sessionIds);\n''',
    'session id deduplication',
)
sessions = replace_once(
    sessions,
    '''    const response = await fetch("/api/sessions", {\n      method: "DELETE",\n      headers: {\n        "Content-Type": "application/json",\n      },\n      body: JSON.stringify({ sessionIds: uniqueSessionIds }),\n    });\n    if (!response.ok && response.status !== 404) {\n      throw new Error(`Request failed: ${response.status}`);\n    }\n''',
    '''    await fetchApi(\n      "/api/sessions",\n      {\n        method: "DELETE",\n        body: JSON.stringify({ sessionIds: uniqueSessionIds }),\n      },\n      { allowedStatuses: [404] },\n    );\n''',
    'session delete request',
)
sessions = replace_once(
    sessions,
    '''        activeSessionRef.current = data.session;\n        setActiveSession(data.session);\n        setSessions((prev) => {\n          const next = prev.map((item) => (item.id === data.session.id ? data.session : item));\n          sessionsRef.current = next;\n          return next;\n        });\n''',
    '''        updateKnownSession(data.session);\n''',
    'active session patch synchronization',
)
sessions = replace_once(
    sessions,
    '''    const queued = saveQueueRef.current.then(run, run);\n    saveQueueRef.current = queued.then(() => undefined, () => undefined);\n    return queued;\n  }, [registerSessionConflict]);\n''',
    '''    return enqueueSessionSave(run);\n  }, [enqueueSessionSave, registerSessionConflict, updateKnownSession]);\n''',
    'session save queue',
)
SESSIONS_PATH.write_text(sessions, encoding="utf-8")

projects = PROJECTS_PATH.read_text(encoding="utf-8")
projects = replace_once(
    projects,
    'import React from "react";\n',
    'import React from "react";\nimport {\n  dedupeResourceIds,\n  fetchApi,\n  fetchJson,\n  readStoredResourceId,\n  writeStoredResourceId,\n} from "@/lib/client/persisted-resource-client";\nimport {\n  usePersistedResourceState,\n  useSerialTaskQueue,\n} from "@/components/context/use-persisted-resource-state";\n',
    'projects React import',
)
projects = replace_once(
    projects,
    '''const buildActiveProjectKey = (userId: string | null) =>\n  userId ? `nodes.active-project-id.${userId}` : "nodes.active-project-id.v1";\nconst AUTO_OPEN_PROJECT_SESSION_THRESHOLD = 10;\n''',
    '''const AUTO_OPEN_PROJECT_SESSION_THRESHOLD = 10;\n''',
    'active project storage key',
)
projects = replace_once(
    projects,
    '''const readStoredActiveProjectId = (userId: string | null) => {\n  try {\n    return localStorage.getItem(buildActiveProjectKey(userId));\n  } catch {\n    return null;\n  }\n};\n\nconst writeStoredActiveProjectId = (userId: string | null, projectId: string | null) => {\n  try {\n    const storageKey = buildActiveProjectKey(userId);\n    if (!projectId) {\n      localStorage.removeItem(storageKey);\n      return;\n    }\n    localStorage.setItem(storageKey, projectId);\n  } catch {\n    // ignore storage errors\n  }\n};\n\n''',
    '''const readStoredActiveProjectId = (userId: string | null) =>\n  readStoredResourceId("project", userId);\n\nconst writeStoredActiveProjectId = (\n  userId: string | null,\n  projectId: string | null,\n) => writeStoredResourceId("project", userId, projectId);\n\n''',
    'project storage helpers',
)
projects = remove_once(
    projects,
    '''async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {\n  const response = await fetch(input, {\n    headers: {\n      "Content-Type": "application/json",\n      ...(init?.headers ?? {}),\n    },\n    ...init,\n  });\n  if (!response.ok) {\n    const error = new Error(`Request failed: ${response.status}`) as Error & { status?: number };\n    error.status = response.status;\n    throw error;\n  }\n  return (await response.json()) as T;\n}\n\n''',
    'projects fetchJson',
)
projects = replace_once(
    projects,
    '''  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);\n  const [activeProject, setActiveProject] = React.useState<ProjectDocument | null>(null);\n  const [isReady, setIsReady] = React.useState(false);\n  const activeProjectRef = React.useRef<ProjectDocument | null>(null);\n  const patchQueueRef = React.useRef<Promise<ProjectDocument | null>>(Promise.resolve(null));\n\n  React.useEffect(() => {\n    activeProjectRef.current = activeProject;\n  }, [activeProject]);\n\n''',
    '''  const {\n    activeResource: activeProject,\n    activeResourceRef: activeProjectRef,\n    prependResource: prependProject,\n    resources: projects,\n    setActiveResource: setActiveProject,\n    setResources: setProjects,\n    updateKnownResource: updateKnownProject,\n  } = usePersistedResourceState<ProjectSummary, ProjectDocument>();\n  const enqueueProjectPatch = useSerialTaskQueue<ProjectDocument | null>(null);\n  const [isReady, setIsReady] = React.useState(false);\n\n''',
    'projects state setup',
)
projects = re.sub(
    r'(?m)^(\s*)activeProjectRef\.current = ([^\n;]+);\n\1setActiveProject\(\2\);',
    r'\1setActiveProject(\2);',
    projects,
)
projects = replace_once(
    projects,
    '''      setProjects((prev) => [data.project, ...prev]);\n      setActiveProject(data.project);\n''',
    '''      prependProject(data.project);\n      setActiveProject(data.project);\n''',
    'create project collection update',
)
projects = replace_once(
    projects,
    '''    const uniqueProjectIds = [...new Set(projectIds)].filter((projectId) => projectId.length > 0);\n''',
    '''    const uniqueProjectIds = dedupeResourceIds(projectIds);\n''',
    'project id deduplication',
)
projects = replace_once(
    projects,
    '''    const response = await fetch("/api/projects", {\n      method: "DELETE",\n      headers: {\n        "Content-Type": "application/json",\n      },\n      body: JSON.stringify({ projectIds: uniqueProjectIds }),\n    });\n    if (!response.ok && response.status !== 404) {\n      throw new Error(`Request failed: ${response.status}`);\n    }\n''',
    '''    await fetchApi(\n      "/api/projects",\n      {\n        method: "DELETE",\n        body: JSON.stringify({ projectIds: uniqueProjectIds }),\n      },\n      { allowedStatuses: [404] },\n    );\n''',
    'project delete request',
)
projects = replace_once(
    projects,
    '''    setProjects((prev) =>\n      prev.map((project) => (project.id === projectId ? data.project : project)),\n    );\n    setActiveProject((prev) => (prev?.id === projectId ? data.project : prev));\n''',
    '''    updateKnownProject(data.project);\n''',
    'rename project synchronization',
)
projects = projects.replace(
    '''      setActiveProject(data.project);\n      setProjects((prev) =>\n        prev.map((project) => (project.id === data.project.id ? data.project : project)),\n      );\n      activeProjectRef.current = data.project;\n''',
    '''      updateKnownProject(data.project);\n''',
)
projects = projects.replace(
    '''    setActiveProject(data.project);\n    setProjects((prev) =>\n      prev.map((project) => (project.id === data.project.id ? data.project : project)),\n    );\n    activeProjectRef.current = data.project;\n''',
    '''    updateKnownProject(data.project);\n''',
)
projects = replace_once(
    projects,
    '''    const nextPatch = patchQueueRef.current.then(enqueue, enqueue);\n    patchQueueRef.current = nextPatch.catch(() => null);\n    return nextPatch;\n  }, []);\n''',
    '''    return enqueueProjectPatch(enqueue);\n  }, [enqueueProjectPatch, updateKnownProject]);\n''',
    'project patch queue',
)
PROJECTS_PATH.write_text(projects, encoding="utf-8")

write_new(
    TEST_PATH,
    '''import { describe, expect, it } from "vitest";\nimport {\n  buildActiveResourceStorageKey,\n  dedupeResourceIds,\n  prependUniqueResource,\n  replaceResourceById,\n} from "@/lib/client/persisted-resource-client";\n\ndescribe("persisted resource client helpers", () => {\n  it("builds user-scoped and anonymous active-resource keys", () => {\n    expect(buildActiveResourceStorageKey("session", "user-42")).toBe(\n      "nodes.active-session-id.user-42",\n    );\n    expect(buildActiveResourceStorageKey("project", null)).toBe(\n      "nodes.active-project-id.v1",\n    );\n  });\n\n  it("deduplicates and removes empty resource ids", () => {\n    expect(dedupeResourceIds(["a", "", "b", "a"])).toEqual(["a", "b"]);\n  });\n\n  it("replaces known resources without changing list order", () => {\n    expect(\n      replaceResourceById(\n        [\n          { id: "a", value: 1 },\n          { id: "b", value: 2 },\n        ],\n        { id: "b", value: 3 },\n      ),\n    ).toEqual([\n      { id: "a", value: 1 },\n      { id: "b", value: 3 },\n    ]);\n  });\n\n  it("prepends a resource while removing an older copy", () => {\n    expect(\n      prependUniqueResource(\n        [\n          { id: "a", value: 1 },\n          { id: "b", value: 2 },\n        ],\n        { id: "b", value: 4 },\n      ),\n    ).toEqual([\n      { id: "b", value: 4 },\n      { id: "a", value: 1 },\n    ]);\n  });\n});\n''',
)

print("Workspace data layer refactor prepared successfully.")
