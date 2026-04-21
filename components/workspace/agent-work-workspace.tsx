"use client";

import React from "react";
import { Activity, ArrowLeft, FolderKanban, MessageSquareText, RefreshCw, Trash2 } from "lucide-react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useProjects } from "@/components/context/projects";
import { Button } from "@/components/ui/button";

type AgentWorkAgent = {
  tokenId: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  eventCount: number;
  sessionIds: string[];
  projectIds: string[];
};

type AgentWorkResponse = {
  agents: AgentWorkAgent[];
  sessions: Array<{
    id: string;
    title: string | null;
    updatedAt: string;
    createdAt: string;
    archived: boolean;
    messageCount: number;
  }>;
  projects: Array<{
    id: string;
    title: string | null;
    updatedAt: string;
    createdAt: string;
    sessionCount: number;
  }>;
  events: Array<{
    id: string;
    tokenId: string | null;
    eventType: string;
    method: string;
    route: string;
    sessionId: string | null;
    projectId: string | null;
    createdAt: string;
  }>;
};

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[18px] bg-background/92 p-5 md:p-6";

const formatDate = (value: string | null) => {
  if (!value) return "never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export function AgentWorkWorkspace() {
  const { showWorkspace } = useWorkspaceSurface();
  const { selectSession } = usePersistedSessions();
  const { selectProject } = useProjects();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [selectedTokenId, setSelectedTokenId] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<AgentWorkResponse | null>(null);

  const refresh = React.useCallback(async (tokenId?: string | null) => {
    setBusy(true);
    setError("");
    try {
      const url = new URL("/api/agents/work", window.location.origin);
      const resolvedTokenId = tokenId ?? selectedTokenId;
      if (resolvedTokenId) {
        url.searchParams.set("tokenId", resolvedTokenId);
      }
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const data = (await res.json()) as AgentWorkResponse;
      setPayload(data);
      setSelectedTokenId((currentSelected) => {
        const preferred = tokenId === undefined ? currentSelected : tokenId;
        if (preferred && data.agents.some((agent) => agent.tokenId === preferred)) {
          return preferred;
        }
        return data.agents[0]?.tokenId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agent work.");
    } finally {
      setBusy(false);
    }
  }, [selectedTokenId]);

  const deleteToken = React.useCallback(async (tokenId: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agents/token?tokenId=${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed: ${res.status}`);
      }
      await refresh(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete agent token.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  React.useEffect(() => {
    void refresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agents = payload?.agents ?? [];
  const events = payload?.events ?? [];
  const sessionsById = React.useMemo(() => new Map((payload?.sessions ?? []).map((s) => [s.id, s])), [payload?.sessions]);
  const projectsById = React.useMemo(() => new Map((payload?.projects ?? []).map((p) => [p.id, p])), [payload?.projects]);

  const selectedAgent = agents.find((agent) => agent.tokenId === selectedTokenId) ?? null;

  return (
    <div className={workspaceBackdropClassName}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
            <Activity className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Agent Work</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Audit what agent tokens created and touched across sessions and projects.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void refresh(selectedTokenId)}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={showWorkspace}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className={shellClassName}>
          <div className={shellInnerClassName}>
            {error ? (
              <p className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
              <section className="rounded-[18px] border border-border/80 bg-card/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Agents
                </p>
                <div className="mt-3 space-y-2">
                  {agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No agent tokens found yet. Mint one in Profile {">"} Agent Access, then let it call the API.
                    </p>
                  ) : null}
                  {agents.map((agent) => (
                    <button
                      key={agent.tokenId}
                      type="button"
                      onClick={() => {
                        setSelectedTokenId(agent.tokenId);
                        void refresh(agent.tokenId);
                      }}
                      className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                        agent.tokenId === selectedTokenId
                          ? "border-sky-500/40 bg-sky-500/10"
                          : "border-border/70 bg-background/70 hover:bg-background/90"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-foreground">
                        {agent.label?.trim() ? agent.label : "Unnamed agent"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        last used {formatDate(agent.lastUsedAt)} · {agent.eventCount} events
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-border/80 bg-card/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Activity
                </p>

                {!selectedAgent ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Select an agent to see what it created.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 rounded-[16px] border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {selectedAgent.label?.trim() ? selectedAgent.label : "Unnamed agent"}
                          </p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            token id {selectedAgent.tokenId}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => void deleteToken(selectedAgent.tokenId)}
                        >
                          <Trash2 className="size-4" />
                          Delete token
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            Created
                          </p>
                          <p className="mt-1 text-sm text-foreground">{formatDate(selectedAgent.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            Expires
                          </p>
                          <p className="mt-1 text-sm text-foreground">{formatDate(selectedAgent.expiresAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            Last used
                          </p>
                          <p className="mt-1 text-sm text-foreground">{formatDate(selectedAgent.lastUsedAt)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[16px] border border-border/70 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <MessageSquareText className="size-4 text-sky-500" />
                          Sessions
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedAgent.sessionIds.length} session{selectedAgent.sessionIds.length === 1 ? "" : "s"} referenced by events.
                        </p>
                        <div className="mt-3 space-y-2">
                          {selectedAgent.sessionIds.slice(0, 6).map((sessionId) => {
                            const session = sessionsById.get(sessionId);
                            return (
                              <div key={sessionId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">
                                    {session?.title ?? "Untitled session"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    updated {formatDate(session?.updatedAt ?? null)}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void selectSession(sessionId)}
                                >
                                  Open
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[16px] border border-border/70 bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <FolderKanban className="size-4 text-violet-500" />
                          Projects
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedAgent.projectIds.length} project{selectedAgent.projectIds.length === 1 ? "" : "s"} referenced by events.
                        </p>
                        <div className="mt-3 space-y-2">
                          {selectedAgent.projectIds.slice(0, 6).map((projectId) => {
                            const project = projectsById.get(projectId);
                            return (
                              <div key={projectId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">
                                    {project?.title ?? "Untitled project"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    updated {formatDate(project?.updatedAt ?? null)}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void selectProject(projectId)}
                                >
                                  Open
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[16px] border border-border/70 bg-background/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Recent events
                      </p>
                      <div className="mt-3 space-y-2">
                        {events.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                        ) : null}
                        {events.slice(0, 12).map((event) => (
                          <div
                            key={event.id}
                            className="rounded-[14px] border border-border/70 bg-card/70 px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{event.eventType}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {event.method} {event.route}
                              {event.sessionId ? ` · session ${event.sessionId}` : ""}
                              {event.projectId ? ` · project ${event.projectId}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
