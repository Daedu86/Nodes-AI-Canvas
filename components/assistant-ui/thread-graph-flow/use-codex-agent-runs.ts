"use client";

import React from "react";
import { normalizeCodexNotification } from "@/lib/agents/codex/event-mapper";
import type {
  CodexAgentRole,
  CodexApprovalDecision,
  CodexCanvasEvent,
  CodexCanvasEventType,
  CodexCanvasSnapshot,
  CodexPersistedRun,
  CodexRunStatus,
  CodexRunnerEventEnvelope,
  CodexRunnerStartResponse,
} from "@/lib/agents/codex/types";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowNode,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const TERMINAL_STATUSES = new Set<CodexRunStatus>(["completed", "failed", "cancelled"]);
const MAX_VISIBLE_EVENTS = 100;
const MAX_PERSISTED_EVENTS = 40;
const ACTIVITY_EVENT_TYPES = new Set<CodexCanvasEventType>([
  "agent.child.spawned",
  "tool.started",
  "tool.completed",
  "shell.started",
  "shell.completed",
  "file.changed",
  "approval.requested",
  "approval.resolved",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);
const MAX_ACTIVITY_NODES_PER_RUN = 8;

export type LocalCodexRun = CodexPersistedRun;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readNestedString = (value: unknown, keys: string[]) => {
  let current = value;
  for (const key of keys) {
    current = asRecord(current)[key];
  }
  return readString(current);
};

const eventParams = (event: CodexCanvasEvent) => asRecord(event.payload.params);

const readAgentDelta = (event: CodexCanvasEvent) => {
  if (event.type !== "agent.message.delta") return null;
  const params = eventParams(event);
  return readString(params.delta) ?? readString(params.text);
};

const readApprovalId = (event: CodexCanvasEvent) =>
  readString(eventParams(event).approvalId);

const statusFromEvent = (
  current: CodexRunStatus,
  event: CodexCanvasEvent,
): CodexRunStatus => {
  switch (event.type) {
    case "agent.started":
    case "agent.message.delta":
    case "agent.message.completed":
    case "tool.started":
    case "tool.completed":
    case "shell.started":
    case "shell.completed":
    case "file.changed":
    case "approval.resolved":
      return "running";
    case "approval.requested":
      return "waiting_for_approval";
    case "run.completed":
      return "completed";
    case "run.failed":
      return "failed";
    case "run.cancelled":
      return "cancelled";
    default:
      return current;
  }
};

const makeLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `codex-agent-${crypto.randomUUID()}`
    : `codex-agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const childLocalId = (runId: string) => `codex-agent-${runId}`;

const activityTitle = (type: CodexCanvasEventType) => {
  switch (type) {
    case "shell.started":
      return "Shell command started";
    case "shell.completed":
      return "Shell command completed";
    case "file.changed":
      return "File changed";
    case "tool.started":
      return "Tool started";
    case "tool.completed":
      return "Tool completed";
    case "approval.requested":
      return "Approval required";
    case "approval.resolved":
      return "Approval resolved";
    case "agent.child.spawned":
      return "Subagent spawned";
    case "run.completed":
      return "Agent completed";
    case "run.failed":
      return "Agent failed";
    case "run.cancelled":
      return "Agent cancelled";
    default:
      return "Agent activity";
  }
};

const activityPreview = (event: CodexCanvasEvent) => {
  const params = eventParams(event);
  const item = asRecord(params.item);
  const command =
    readString(params.command) ??
    readString(params.cmd) ??
    readString(item.command) ??
    readString(item.cmd);
  const file =
    readString(params.path) ??
    readString(params.filePath) ??
    readString(item.path) ??
    readString(item.filePath);
  const tool =
    readString(params.toolName) ??
    readString(params.name) ??
    readString(item.toolName) ??
    readString(item.name);
  const childLabel = readString(params.label);
  const decision = readString(params.decision);
  const message = readString(params.message) ?? readNestedString(params, ["turn", "error", "message"]);

  if (command) return command.slice(0, 260);
  if (file) return file.slice(0, 260);
  if (tool) return tool.slice(0, 260);
  if (childLabel) return childLabel.slice(0, 260);
  if (decision) return `Decision: ${decision}`;
  if (message) return message.slice(0, 260);
  return event.type.replaceAll(".", " ");
};

const readSpawnedChild = (event: CodexCanvasEvent) => {
  if (event.type !== "agent.child.spawned") return null;
  const params = eventParams(event);
  const runId = readString(params.childRunId) ?? readString(params.runId);
  if (!runId) return null;
  return {
    runId,
    threadId: readString(params.childThreadId) ?? readString(params.threadId),
    agentId: readString(params.childAgentId) ?? readString(params.agentId),
    label: readString(params.label) ?? "Codex Subagent",
    role: (readString(params.role) as CodexAgentRole | null) ?? "custom",
  };
};

const snapshotRuns = (runs: LocalCodexRun[]): CodexPersistedRun[] =>
  runs.map((run) => ({
    ...run,
    events: run.events.slice(-MAX_PERSISTED_EVENTS),
  }));

export function useCodexAgentRuns({
  sessionId,
  projectId = null,
}: {
  sessionId: string | null;
  projectId?: string | null;
}) {
  const [runs, setRuns] = React.useState<LocalCodexRun[]>([]);
  const [hydratedSessionId, setHydratedSessionId] = React.useState<string | null>(null);
  const runsRef = React.useRef(runs);
  const streamsRef = React.useRef(new Map<string, EventSource>());
  const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openStreamRef = React.useRef<
    (localId: string, runResponse: CodexRunnerStartResponse, afterEventId?: string | null) => void
  >(() => {});

  React.useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const closeStream = React.useCallback((localId: string) => {
    streamsRef.current.get(localId)?.close();
    streamsRef.current.delete(localId);
  }, []);

  const closeAllStreams = React.useCallback(() => {
    streamsRef.current.forEach((stream) => stream.close());
    streamsRef.current.clear();
  }, []);

  React.useEffect(
    () => () => {
      closeAllStreams();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [closeAllStreams],
  );

  const patchRun = React.useCallback(
    (
      localId: string,
      patch: Partial<LocalCodexRun> | ((run: LocalCodexRun) => Partial<LocalCodexRun>),
    ) => {
      setRuns((current) =>
        current.map((run) => {
          if (run.localId !== localId) return run;
          const resolved = typeof patch === "function" ? patch(run) : patch;
          return { ...run, ...resolved };
        }),
      );
    },
    [],
  );

  const updateAgentPosition = React.useCallback(
    (localId: string, position: { x: number; y: number }) => {
      patchRun(localId, { position });
    },
    [patchRun],
  );

  const addAgent = React.useCallback((parentLocalId?: string | null) => {
    setRuns((current) => {
      const parent = parentLocalId
        ? current.find((entry) => entry.localId === parentLocalId) ?? null
        : null;
      const siblingCount = parent
        ? current.filter((entry) => entry.parentLocalId === parent.localId).length
        : current.filter((entry) => !entry.parentLocalId).length;
      const position = parent
        ? {
            x: parent.position.x + 430,
            y: parent.position.y + siblingCount * 300,
          }
        : {
            x: 220 + (siblingCount % 3) * 420,
            y: 180 + Math.floor(siblingCount / 3) * 320,
          };
      return [
        ...current,
        {
          localId: makeLocalId(),
          runId: null,
          threadId: null,
          agentId: null,
          parentLocalId: parent?.localId ?? null,
          parentRunId: parent?.runId ?? null,
          role: "coder",
          label: parent ? "Codex Subagent" : "Codex Agent",
          prompt: "",
          output: "",
          status: "queued",
          events: [],
          pendingApprovalId: null,
          error: null,
          position,
        },
      ];
    });
  }, []);

  const ensureSpawnedChild = React.useCallback(
    (parentLocalId: string, event: CodexCanvasEvent) => {
      const spawned = readSpawnedChild(event);
      if (!spawned) return;
      let shouldOpen = false;
      let localId = childLocalId(spawned.runId);
      setRuns((current) => {
        const existing = current.find((run) => run.runId === spawned.runId);
        if (existing) {
          localId = existing.localId;
          return current;
        }
        const parent = current.find((run) => run.localId === parentLocalId);
        if (!parent) return current;
        const siblingCount = current.filter((run) => run.parentLocalId === parentLocalId).length;
        shouldOpen = true;
        return [
          ...current,
          {
            localId,
            runId: spawned.runId,
            threadId: spawned.threadId,
            agentId: spawned.agentId,
            parentLocalId,
            parentRunId: parent.runId,
            role: spawned.role,
            label: spawned.label,
            prompt: "Spawned automatically by Codex.",
            output: "",
            status: "running",
            events: [],
            pendingApprovalId: null,
            error: null,
            position: {
              x: parent.position.x + 430,
              y: parent.position.y + siblingCount * 300,
            },
          },
        ];
      });
      if (shouldOpen) {
        queueMicrotask(() =>
          openStreamRef.current(localId, {
            runId: spawned.runId,
            threadId: spawned.threadId,
            status: "running",
            agentId: spawned.agentId,
            parentRunId: event.runId,
          }),
        );
      }
    },
    [],
  );

  const openStream = React.useCallback(
    (localId: string, runResponse: CodexRunnerStartResponse, afterEventId?: string | null) => {
      if (streamsRef.current.has(localId)) return;
      const currentRun = runsRef.current.find((run) => run.localId === localId);
      const cursor = afterEventId ?? currentRun?.events.at(-1)?.id ?? null;
      const query = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
      const stream = new EventSource(
        `/api/agents/codex/runs/${encodeURIComponent(runResponse.runId)}/events${query}`,
      );
      streamsRef.current.set(localId, stream);

      stream.onmessage = (message) => {
        try {
          const envelope = JSON.parse(message.data) as CodexRunnerEventEnvelope;
          if (!envelope.notification?.method) return;
          const normalized = normalizeCodexNotification({
            notification: envelope.notification,
            runId: envelope.runId || runResponse.runId,
            eventId: envelope.id,
            createdAt: envelope.createdAt,
            threadId: envelope.threadId ?? runResponse.threadId ?? null,
            parentRunId: envelope.parentRunId ?? runResponse.parentRunId ?? null,
            agentId: envelope.agentId ?? runResponse.agentId ?? null,
          });

          if (normalized.type === "agent.child.spawned") {
            ensureSpawnedChild(localId, normalized);
          }

          patchRun(localId, (current) => {
            if (current.events.some((event) => event.id === normalized.id)) return {};
            const delta = readAgentDelta(normalized);
            const approvalId = readApprovalId(normalized);
            const status = statusFromEvent(current.status, normalized);
            const terminal = TERMINAL_STATUSES.has(status);
            if (terminal) queueMicrotask(() => closeStream(localId));
            return {
              status,
              output: delta ? `${current.output}${delta}` : current.output,
              events: [...current.events, normalized].slice(-MAX_VISIBLE_EVENTS),
              pendingApprovalId:
                normalized.type === "approval.requested"
                  ? approvalId
                  : normalized.type === "approval.resolved"
                    ? null
                    : current.pendingApprovalId,
              error:
                normalized.type === "run.failed"
                  ? readString(eventParams(normalized).message) ?? "Codex run failed."
                  : current.error,
            };
          });
        } catch (error) {
          patchRun(localId, {
            error: error instanceof Error ? error.message : "Invalid Codex event.",
          });
        }
      };

      stream.onerror = () => {
        const current = runsRef.current.find((entry) => entry.localId === localId);
        if (current && TERMINAL_STATUSES.has(current.status)) {
          closeStream(localId);
        }
      };
    },
    [closeStream, ensureSpawnedChild, patchRun],
  );

  React.useEffect(() => {
    openStreamRef.current = openStream;
  }, [openStream]);

  React.useEffect(() => {
    let cancelled = false;
    closeAllStreams();
    setRuns([]);
    setHydratedSessionId(null);
    if (!sessionId) return () => {
      cancelled = true;
    };

    void fetch(`/api/agents/codex/state?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to restore Codex agents (${response.status}).`);
        return (await response.json()) as { snapshot?: CodexCanvasSnapshot };
      })
      .then((body) => {
        if (cancelled) return;
        const restored = body.snapshot?.sessionId === sessionId ? body.snapshot.runs : [];
        setRuns(restored ?? []);
        setHydratedSessionId(sessionId);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[codex-agents] failed to restore canvas state", error);
        setHydratedSessionId(sessionId);
      });

    return () => {
      cancelled = true;
    };
  }, [closeAllStreams, sessionId]);

  React.useEffect(() => {
    if (!sessionId || hydratedSessionId !== sessionId) return;
    runs.forEach((run) => {
      if (!run.runId || TERMINAL_STATUSES.has(run.status) || streamsRef.current.has(run.localId)) return;
      openStream(run.localId, {
        runId: run.runId,
        threadId: run.threadId,
        status: run.status,
        agentId: run.agentId,
        parentRunId: run.parentRunId,
      });
    });
  }, [hydratedSessionId, openStream, runs, sessionId]);

  React.useEffect(() => {
    if (!sessionId || hydratedSessionId !== sessionId) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const snapshot: CodexCanvasSnapshot = {
      version: 1,
      sessionId,
      projectId,
      runs: snapshotRuns(runs),
      updatedAt: new Date().toISOString(),
    };
    persistTimerRef.current = setTimeout(() => {
      void fetch("/api/agents/codex/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot }),
      }).catch((error) => {
        console.warn("[codex-agents] failed to persist canvas state", error);
      });
    }, 600);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [hydratedSessionId, projectId, runs, sessionId]);

  const startAgent = React.useCallback(
    async (localId: string) => {
      const current = runsRef.current.find((entry) => entry.localId === localId);
      if (!current || !sessionId || !current.prompt.trim() || current.runId) return;
      patchRun(localId, { status: "queued", error: null });
      try {
        const response = await fetch("/api/agents/codex/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            projectId,
            workspaceId: projectId,
            prompt: current.prompt.trim(),
            role: current.role,
            label: current.label,
            parentRunId: current.parentRunId,
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | (Partial<CodexRunnerStartResponse> & { error?: string })
          | null;
        if (!response.ok || !body?.runId) {
          throw new Error(body?.error || `Unable to start Codex agent (${response.status}).`);
        }
        const runResponse: CodexRunnerStartResponse = {
          runId: body.runId,
          threadId: body.threadId ?? null,
          status: body.status ?? "running",
          agentId: body.agentId ?? null,
          parentRunId: body.parentRunId ?? current.parentRunId,
        };
        patchRun(localId, {
          runId: runResponse.runId,
          threadId: runResponse.threadId ?? null,
          agentId: runResponse.agentId ?? null,
          parentRunId: runResponse.parentRunId ?? null,
          status: runResponse.status,
        });
        openStream(localId, runResponse);
      } catch (error) {
        patchRun(localId, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unable to start Codex agent.",
        });
      }
    },
    [openStream, patchRun, projectId, sessionId],
  );

  const cancelAgent = React.useCallback(
    async (localId: string) => {
      const current = runsRef.current.find((entry) => entry.localId === localId);
      if (!current?.runId || TERMINAL_STATUSES.has(current.status)) return;
      try {
        const response = await fetch(
          `/api/agents/codex/runs/${encodeURIComponent(current.runId)}/cancel`,
          { method: "POST" },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Unable to cancel Codex agent.");
        }
        patchRun(localId, { status: "cancelled", pendingApprovalId: null });
        closeStream(localId);
      } catch (error) {
        patchRun(localId, {
          error: error instanceof Error ? error.message : "Unable to cancel Codex agent.",
        });
      }
    },
    [closeStream, patchRun],
  );

  const resolveApproval = React.useCallback(
    async (localId: string, decision: CodexApprovalDecision) => {
      const current = runsRef.current.find((entry) => entry.localId === localId);
      if (!current?.runId || !current.pendingApprovalId) return;
      try {
        const response = await fetch(
          `/api/agents/codex/runs/${encodeURIComponent(current.runId)}/approvals/${encodeURIComponent(current.pendingApprovalId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Unable to resolve Codex approval.");
        }
        patchRun(localId, {
          status: decision === "cancel" ? "cancelled" : "running",
          pendingApprovalId: null,
          error: null,
        });
      } catch (error) {
        patchRun(localId, {
          error: error instanceof Error ? error.message : "Unable to resolve Codex approval.",
        });
      }
    },
    [patchRun],
  );

  const removeAgent = React.useCallback(
    (localId: string) => {
      const all = runsRef.current;
      const ids = new Set<string>([localId]);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const run of all) {
          if (run.parentLocalId && ids.has(run.parentLocalId) && !ids.has(run.localId)) {
            ids.add(run.localId);
            expanded = true;
          }
        }
      }
      const blocked = all.some(
        (run) => ids.has(run.localId) && run.runId && !TERMINAL_STATUSES.has(run.status),
      );
      if (blocked) return;
      ids.forEach((id) => closeStream(id));
      setRuns((entries) => entries.filter((entry) => !ids.has(entry.localId)));
    },
    [closeStream],
  );

  const runNodes = React.useMemo<ThreadGraphFlowNode[]>(
    () =>
      runs.map((run) => ({
        id: run.localId,
        type: "agentRunNode",
        position: run.position,
        data: {
          kind: "agent-run",
          role: "agent",
          title: run.label,
          preview: run.output || run.prompt || "Configure a Codex agent task.",
          provider: "codex",
          providerLabel: "Codex",
          statusLabel: run.status,
          agentRunId: run.runId,
          agentThreadId: run.threadId,
          agentParentRunId: run.parentRunId,
          agentStatus: run.status,
          agentRole: run.role,
          agentPrompt: run.prompt,
          agentOutput: run.output,
          agentEventCount: run.events.length,
          agentError: run.error,
          agentPendingApprovalId: run.pendingApprovalId,
          onAgentPromptChange: (value) => patchRun(run.localId, { prompt: value }),
          onAgentRoleChange: (role) => patchRun(run.localId, { role }),
          onAgentStart: () => void startAgent(run.localId),
          onAgentCancel: () => void cancelAgent(run.localId),
          onAgentRemove: () => removeAgent(run.localId),
          onAgentSpawnChild: run.runId ? () => addAgent(run.localId) : undefined,
          onAgentApproval: (decision) => void resolveApproval(run.localId, decision),
        },
      })),
    [addAgent, cancelAgent, patchRun, removeAgent, resolveApproval, runs, startAgent],
  );

  const activityNodes = React.useMemo<ThreadGraphFlowNode[]>(
    () =>
      runs.flatMap((run) =>
        run.events
          .filter((event) => ACTIVITY_EVENT_TYPES.has(event.type))
          .slice(-MAX_ACTIVITY_NODES_PER_RUN)
          .map((event, index) => ({
            id: `codex-activity-${event.id}`,
            type: "agentActivityNode",
            position: {
              x: run.position.x,
              y: run.position.y + 300 + index * 120,
            },
            draggable: false,
            data: {
              kind: "agent-activity",
              role: "agent-activity",
              title: activityTitle(event.type),
              preview: activityPreview(event),
              provider: "codex",
              providerLabel: "Codex",
              agentRunId: run.runId,
              agentThreadId: run.threadId,
              agentParentRunId: run.parentRunId,
              agentActivityType: event.type,
              agentActivityCreatedAt: event.createdAt,
            },
          })),
      ),
    [runs],
  );

  const agentEdges = React.useMemo<ThreadGraphFlowEdge[]>(() => {
    const edges: ThreadGraphFlowEdge[] = [];
    runs.forEach((run) => {
      if (run.parentLocalId) {
        edges.push({
          id: `codex-agent-edge-${run.parentLocalId}-${run.localId}`,
          source: run.parentLocalId,
          target: run.localId,
          type: "threadEdge",
          data: { label: "subagent", tone: "default" },
        });
      }
      const activities = run.events
        .filter((event) => ACTIVITY_EVENT_TYPES.has(event.type))
        .slice(-MAX_ACTIVITY_NODES_PER_RUN);
      let source = run.localId;
      activities.forEach((event) => {
        const target = `codex-activity-${event.id}`;
        edges.push({
          id: `codex-activity-edge-${source}-${target}`,
          source,
          target,
          type: "threadEdge",
          data: { tone: "default" },
        });
        source = target;
      });
    });
    return edges;
  }, [runs]);

  return {
    addAgent,
    agentEdges,
    agentNodes: [...runNodes, ...activityNodes],
    runCount: runs.length,
    updateAgentPosition,
  };
}
