// @vitest-environment jsdom

import React from "react";
import { SessionProvider } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  PersistedSessionsProvider,
  usePersistedSessions,
} from "../components/context/persisted-sessions";

const ACTIVE_SESSION_KEY = "nodes.active-session-id.test-user";
const TEST_SESSION = {
  expires: "2099-01-01T00:00:00.000Z",
  user: {
    email: "test@nodes.local",
    id: "test-user",
    name: "Test User",
  },
};

const createJsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

const createSessionSummary = (id: string, title: string, version = 1) => ({
  archived: false,
  createdAt: "2026-04-03T10:00:00.000Z",
  id,
  messageCount: 1,
  title,
  updatedAt: "2026-04-03T10:00:00.000Z",
  version,
});

const createSessionDocument = (id: string, title: string, version = 1) => ({
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-04-03T10:00:00.000Z",
  id,
  messageCount: 1,
  snapshot: {
    currentRootId: null,
    roots: [],
    selectedMessageId: null,
    version: 1,
  },
  title,
  updatedAt: "2026-04-03T10:00:00.000Z",
  version,
});

function RenameRecoveryProbe() {
  const { activeSessionId, isReady, renameSession, sessions } = usePersistedSessions();
  const invokedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isReady || activeSessionId !== "session-a" || invokedRef.current) {
      return;
    }
    invokedRef.current = true;
    void renameSession("session-a", "Renamed");
  }, [activeSessionId, isReady, renameSession]);

  return (
    <div>
      <div data-testid="ready">{String(isReady)}</div>
      <div data-testid="active-session">{activeSessionId ?? "none"}</div>
      <div data-testid="sessions">{sessions.map((session) => session.id).join(",")}</div>
    </div>
  );
}

function ConflictResolutionProbe() {
  const { activeSession, isReady, renameSession } = usePersistedSessions();
  const invokedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isReady || activeSession?.id !== "session-a" || invokedRef.current) return;
    invokedRef.current = true;
    void renameSession("session-a", "Local title");
  }, [activeSession?.id, isReady, renameSession]);

  return <div data-testid="active-title">{activeSession?.title ?? "none"}</div>;
}

function renderWithSession(children: React.ReactNode) {
  return render(
    <SessionProvider session={TEST_SESSION}>
      {children}
    </SessionProvider>,
  );
}

describe("PersistedSessionsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("recovers gracefully when renaming a missing active session returns 404", async () => {
    localStorage.setItem(ACTIVE_SESSION_KEY, "session-a");
    let listCallCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/sessions?includeArchived=1") {
        listCallCount += 1;
        return createJsonResponse({
          sessions: listCallCount === 1
            ? [
                createSessionSummary("session-a", "Session A"),
                createSessionSummary("session-b", "Session B"),
              ]
            : [createSessionSummary("session-b", "Session B")],
        });
      }

      if (url === "/api/sessions/session-a" && method === "GET") {
        return createJsonResponse({
          session: createSessionDocument("session-a", "Session A"),
        });
      }

      if (url === "/api/sessions/session-a" && method === "PATCH") {
        return createJsonResponse({}, 404);
      }

      if (url === "/api/sessions/session-b" && method === "GET") {
        return createJsonResponse({
          session: createSessionDocument("session-b", "Session B"),
        });
      }

      if (url === "/api/sessions" && method === "POST") {
        return createJsonResponse({
          session: createSessionDocument("session-new", "New Session"),
        }, 201);
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithSession(
      <PersistedSessionsProvider>
        <RenameRecoveryProbe />
      </PersistedSessionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
      expect(screen.getByTestId("active-session").textContent).toBe("session-b");
    });

    expect(screen.getByTestId("sessions").textContent).toBe("session-b");
    expect(localStorage.getItem(ACTIVE_SESSION_KEY)).toBe("session-b");
  });

  it("reopens the stored session during post-auth handoff instead of creating a fresh one", async () => {
    localStorage.setItem(ACTIVE_SESSION_KEY, "session-a");
    window.history.replaceState({}, "", "/?handoff=chat");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/sessions?includeArchived=1") {
        return createJsonResponse({
          sessions: [createSessionSummary("session-a", "Session A")],
        });
      }

      if (url === "/api/sessions/session-a" && method === "GET") {
        return createJsonResponse({
          session: createSessionDocument("session-a", "Session A"),
        });
      }

      if (url === "/api/sessions/session-a" && method === "PATCH") {
        return createJsonResponse({
          session: createSessionDocument("session-a", "Session A", 2),
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithSession(
      <PersistedSessionsProvider>
        <RenameRecoveryProbe />
      </PersistedSessionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
      expect(screen.getByTestId("active-session").textContent).toBe("session-a");
    });

    expect(localStorage.getItem(ACTIVE_SESSION_KEY)).toBe("session-a");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === "/api/sessions/session-a" && init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      expectedVersion: 1,
      title: "Renamed",
    });
  });

  it("shows an explicit choice when another writer changed the session", async () => {
    localStorage.setItem(ACTIVE_SESSION_KEY, "session-a");
    const remoteSession = createSessionDocument("session-a", "Remote title", 2);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/sessions?includeArchived=1") {
        return createJsonResponse({
          sessions: [createSessionSummary("session-a", "Session A")],
        });
      }
      if (url === "/api/sessions/session-a" && method === "GET") {
        return createJsonResponse({
          session: createSessionDocument("session-a", "Session A"),
        });
      }
      if (url === "/api/sessions/session-a" && method === "PATCH") {
        return createJsonResponse({
          code: "session_version_conflict",
          error: "The session changed after it was loaded.",
          expectedVersion: 1,
          session: remoteSession,
        }, 409);
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithSession(
      <PersistedSessionsProvider>
        <ConflictResolutionProbe />
      </PersistedSessionsProvider>,
    );

    const conflictDialog = await screen.findByRole("alertdialog");
    expect(conflictDialog.textContent).toContain("Session changed elsewhere");
    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));

    await waitFor(() => {
      expect(screen.getByTestId("active-title").textContent).toBe("Remote title");
    });

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === "/api/sessions/session-a" && init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      expectedVersion: 1,
      title: "Local title",
    });
  });

  it("creates a fresh session during post-auth handoff when the user has no existing sessions", async () => {
    window.history.replaceState({}, "", "/?handoff=chat");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/sessions?includeArchived=1") {
        return createJsonResponse({ sessions: [] });
      }

      if (url === "/api/sessions" && method === "POST") {
        return createJsonResponse({
          session: createSessionDocument("session-fresh", "Fresh Session"),
        }, 201);
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithSession(
      <PersistedSessionsProvider>
        <RenameRecoveryProbe />
      </PersistedSessionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
      expect(screen.getByTestId("active-session").textContent).toBe("session-fresh");
    });

    expect(localStorage.getItem(ACTIVE_SESSION_KEY)).toBe("session-fresh");
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ method: "POST" }));
  });
});
