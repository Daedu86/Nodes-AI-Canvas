"use client";

import React from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  FolderKanban,
  MessageSquareText,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useProjects } from "@/components/context/projects";
import { Button } from "@/components/ui/button";
import {
  CODEX_MODEL_OPTIONS,
  CODEX_TOOL_OPTIONS,
  readCodexAgentDefaults,
  writeCodexAgentDefaults,
  type CodexAgentDefaults,
  type CodexAgentTool,
} from "@/lib/agents/codex/defaults";

type AgentWorkAgent = {
  tokenId: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  eventCount: number;
  sessionIds: string[];
  projectIds: string[];
  connected?: boolean;
  model?: string | null;
};

type AgentWorkResponse = {
  agents: AgentWorkAgent[];
  sessions: Array<{ id: string; title: string | null; updatedAt: string; createdAt: string; archived: boolean; messageCount: number }>;
  projects: Array<{ id: string; title: string | null; updatedAt: string; createdAt: string; sessionCount: number }>;
  events: Array<{ id: string; tokenId: string | null; eventType: string; method: string; route: string; sessionId: string | null; projectId: string | null; createdAt: string }>;
};

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[18px] bg-background/92 p-5 md:p-6";

const formatDate = (value: string | null) => {
  if (!value) return "never";
  try { return new Date(value).toLocaleString(); } catch { return value; }
};

export function AgentWorkWorkspace() {
  const { showWorkspace } = useWorkspaceSurface();
  const { selectSession } = usePersistedSessions();
  const { selectProject } = useProjects();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [selectedTokenId, setSelectedTokenId] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<AgentWorkResponse | null>(null);
  const [defaults, setDefaults] = React.useState<CodexAgentDefaults>(() => readCodexAgentDefaults());

  const refresh = React.useCallback(async (tokenId?: string | null) => {
    setBusy(true);
    setError("");
    try {
      const url = new URL("/api/agents/work", window.location.origin);
      const resolvedTokenId = tokenId ?? selectedTokenId;
      if (resolvedTokenId) url.searchParams.set("tokenId", resolvedTokenId);
      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as AgentWorkResponse;
      setPayload(data);
      setSelectedTokenId((current) => {
        const preferred = tokenId === undefined ? current : tokenId;
        return preferred && data.agents.some((agent) => agent.tokenId === preferred)
          ? preferred
          : data.agents[0]?.tokenId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agent work.");
    } finally { setBusy(false); }
  }, [selectedTokenId]);

  const deleteToken = React.useCallback(async (tokenId: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agents/token?tokenId=${encodeURIComponent(tokenId)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed: ${res.status}`);
      }
      await refresh(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete agent token.");
    } finally { setBusy(false); }
  }, [refresh]);

  React.useEffect(() => { void refresh(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTool = (tool: CodexAgentTool) => {
    setDefaults((current) => ({
      ...current,
      tools: current.tools.includes(tool)
        ? current.tools.filter((item) => item !== tool)
        : [...current.tools, tool],
    }));
  };

  const saveDefaults = () => {
    writeCodexAgentDefaults(defaults);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const agents = payload?.agents ?? [];
  const events = payload?.events ?? [];
  const selectedAgent = agents.find((agent) => agent.tokenId === selectedTokenId) ?? null;
  const sessionsById = React.useMemo(() => new Map((payload?.sessions ?? []).map((item) => [item.id, item])), [payload?.sessions]);
  const projectsById = React.useMemo(() => new Map((payload?.projects ?? []).map((item) => [item.id, item])), [payload?.projects]);

  return (
    <div className={workspaceBackdropClassName}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60"><Activity className="size-4" /></div>
          <div><h1 className="text-base font-semibold">Agent Work</h1><p className="mt-1 text-sm text-muted-foreground">Configure agent defaults and audit agent activity.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh(selectedTokenId)}><RefreshCw className="size-4" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={showWorkspace}><ArrowLeft className="size-4" />Back</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className={shellClassName}><div className={shellInnerClassName}>
          {error ? <p className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <section className="mb-5 rounded-[18px] border border-sky-500/25 bg-sky-500/[0.06] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-sky-600">Agent defaults</p><h2 className="mt-1 text-lg font-semibold">Defaults for new Canvas agents</h2><p className="mt-1 text-sm text-muted-foreground">New nodes inherit these settings. Existing nodes keep their own configuration.</p></div>
              <Button onClick={saveDefaults}><Save className="size-4" />{saved ? "Saved" : "Save defaults"}</Button>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-4">
              <label className="space-y-2"><span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Default model</span><select value={defaults.model} onChange={(event) => setDefaults((current) => ({ ...current, model: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">{CODEX_MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
              <div className="space-y-2"><span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Default tools</span><div className="flex min-h-10 flex-wrap gap-2">{CODEX_TOOL_OPTIONS.map((tool) => <button key={tool} type="button" onClick={() => toggleTool(tool)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${defaults.tools.includes(tool) ? "border-sky-500/40 bg-sky-500/12 text-sky-700" : "border-border bg-background text-muted-foreground"}`}>{tool}</button>)}</div></div>
              <label className="space-y-2"><span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</span><select value={defaults.workspace} onChange={(event) => setDefaults((current) => ({ ...current, workspace: event.target.value as CodexAgentDefaults["workspace"] }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="temporary">Temporary</option><option value="project">Current project</option></select></label>
              <label className="space-y-2"><span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Approval mode</span><select value={defaults.approvalMode} onChange={(event) => setDefaults((current) => ({ ...current, approvalMode: event.target.value as CodexAgentDefaults["approvalMode"] }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="ask">Ask before risky actions</option><option value="auto">Auto approve</option></select></label>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <section className="rounded-[18px] border border-border/80 bg-card/88 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Agents</p>
              <div className="mt-3 space-y-2">
                {agents.length === 0 ? <p className="text-sm text-muted-foreground">No agents recorded yet.</p> : null}
                {agents.map((agent) => <button key={agent.tokenId} type="button" onClick={() => { setSelectedTokenId(agent.tokenId); void refresh(agent.tokenId); }} className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${agent.tokenId === selectedTokenId ? "border-sky-500/40 bg-sky-500/10" : "border-border/70 bg-background/70 hover:bg-background/90"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{agent.label?.trim() || "Unnamed agent"}</p>{agent.tokenId === "codex-runtime" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${agent.connected ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"}`}>{agent.connected ? "Connected" : "Offline"}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{agent.model ? `${agent.model} · ` : ""}{agent.eventCount} events</p></button>)}
              </div>
            </section>

            <section className="rounded-[18px] border border-border/80 bg-card/88 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Activity</p>
              {!selectedAgent ? <p className="mt-3 text-sm text-muted-foreground">Select an agent to see its activity.</p> : <>
                <div className="mt-3 rounded-[16px] border border-border/70 bg-background/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Bot className="size-4" /><p className="font-semibold">{selectedAgent.label?.trim() || "Unnamed agent"}</p>{selectedAgent.connected ? <CheckCircle2 className="size-4 text-emerald-500" /> : null}</div><p className="mt-1 text-xs text-muted-foreground">{selectedAgent.model || defaults.model} · last used {formatDate(selectedAgent.lastUsedAt)}</p></div>{selectedAgent.tokenId !== "codex-runtime" ? <Button variant="destructive" size="sm" disabled={busy} onClick={() => void deleteToken(selectedAgent.tokenId)}><Trash2 className="size-4" />Delete token</Button> : null}</div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[16px] border border-border/70 bg-background/70 p-4"><div className="flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-sky-500" />Sessions</div><div className="mt-3 space-y-2">{selectedAgent.sessionIds.slice(0, 6).map((id) => <div key={id} className="flex items-center justify-between gap-2"><span className="truncate text-sm">{sessionsById.get(id)?.title ?? "Untitled session"}</span><Button variant="outline" size="sm" onClick={() => void selectSession(id)}>Open</Button></div>)}</div></div>
                  <div className="rounded-[16px] border border-border/70 bg-background/70 p-4"><div className="flex items-center gap-2 font-semibold"><FolderKanban className="size-4 text-violet-500" />Projects</div><div className="mt-3 space-y-2">{selectedAgent.projectIds.slice(0, 6).map((id) => <div key={id} className="flex items-center justify-between gap-2"><span className="truncate text-sm">{projectsById.get(id)?.title ?? "Untitled project"}</span><Button variant="outline" size="sm" onClick={() => void selectProject(id)}>Open</Button></div>)}</div></div>
                </div>
                <div className="mt-4 rounded-[16px] border border-border/70 bg-background/70 p-4"><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Recent events</p><div className="mt-3 space-y-2">{events.length === 0 ? <p className="text-sm text-muted-foreground">No events recorded yet.</p> : events.slice(0, 12).map((event) => <div key={event.id} className="rounded-[14px] border border-border/70 bg-card/70 px-3 py-2 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{event.eventType}</span><span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span></div><p className="mt-1 text-xs text-muted-foreground">{event.method} {event.route}</p></div>)}</div></div>
              </>}
            </section>
          </div>
        </div></div>
      </div>
    </div>
  );
}
