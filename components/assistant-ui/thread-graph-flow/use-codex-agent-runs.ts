"use client";

import React from "react";
import { normalizeCodexNotification } from "@/lib/agents/codex/event-mapper";
import type {
  CodexAgentRole,
  CodexApprovalDecision,
  CodexCanvasEvent,
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

type LocalCodexRun = {
  localId: string;
  runId: string | null;
  threadId: string | null;
  agentId: string | null;
  parentLocalId: string | null;
  parentRunId: string | null;
  role: CodexAgentRole;
  label: string;
  prompt: string;
  output: string;
  status: CodexRunStatus;
  events: CodexCanvasEvent[];
  pendingApprovalId: string | null;
  error: string | null;
  position: { x: number; y: number };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

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

export function useCodexAgentRuns({
  sessionId,
  projectId = null,
}: {
  sessionId: string | null;
  projectId?: string | null;
}) {
  const [runs, setRuns] = React.useState<LocalCodexRun[]>([]);
  const runsRef = React.useRef(runs);
  const streamsRef = React.useRef(new Map<string, EventSource>());

  React.useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  React.useEffect(
    () => () => {
      streamsRef.current.forEach((stream) => stream.close());
      streamsRef.current.clear();
    },
    [],
  );

  const patchRun = React.useCallback(
    (localId: string, patch: Partial<LocalCodexRun> | ((run: LocalCodexRun) => Partial<LocalCodexRun>)) => {
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
            x: parent.position.x + 420,
            y: parent.position.y + siblingCount * 260,
          }
        : {
            x: 220 + (siblingCount % 3) * 400,
            y: 180 + Math.floor(siblingCount / 3) * 300,
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

  const closeStream = React.useCallback((localId: string) => {
    streamsRef.current.get(localId)?.close();
    streamsRef.current.delete(localId);
  }, []);

  const openStream = React.useCallback(
    (localId: string, runResponse: CodexRunnerStartResponse) => {
      closeStream(localId);
      const stream = new EventSource(
        `/api/agents/codex/runs/${encodeURIComponent(runResponse.runId)}/events`,
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

          patchRun(localId, (current) => {
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
    [closeStream, patchRun],
  );

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
      const current = runsRef.current.find((entry) => entry.localId === localId);
      if (current && !TERMINAL_STATUSES.has(current.status) && current.runId) return;
      closeStream(localId);
      setRuns((entries) => entries.filter((entry) => entry.localId !== localId));
    },
    [closeStream],
  );

  const nodes = React.useMemo<ThreadGraphFlowNode[]>(
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

  const edges = React.useMemo<ThreadGraphFlowEdge[]>(
    () =>
      runs.flatMap((run) =>
        run.parentLocalId
          ? [
              {
                id: `codex-agent-edge-${run.parentLocalId}-${run.localId}`,
                source: run.parentLocalId,
                target: run.localId,
                type: "threadEdge",
                data: { label: "subagent", tone: "default" },
              } satisfies ThreadGraphFlowEdge,
            ]
          : [],
      ),
    [runs],
  );

  return {
    addAgent,
    agentEdges: edges,
    agentNodes: nodes,
    runCount: runs.length,
  };
}
