"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Check, GitBranchPlus, Play, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodexAgentRole } from "@/lib/agents/codex/types";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const RUNNING_STATUSES = new Set(["queued", "running", "waiting_for_approval"]);

const roleLabels: Record<CodexAgentRole, string> = {
  coder: "Coder",
  reviewer: "Reviewer",
  researcher: "Researcher",
  tester: "Tester",
  custom: "Custom",
};

export const CodexAgentRunNode = memo(
  ({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
    const status = data.agentStatus ?? "queued";
    const role = data.agentRole ?? "coder";
    const prompt = data.agentPrompt ?? "";
    const output = data.agentOutput ?? "";
    const running = RUNNING_STATUSES.has(status);
    const started = Boolean(data.agentRunId);
    const canStart = !started && prompt.trim().length > 0;
    const pendingApproval = data.agentPendingApprovalId;

    return (
      <div
        className={[
          "group relative w-[390px] rounded-2xl border bg-slate-950/95 p-px shadow-[0_24px_60px_-34px_rgba(59,130,246,0.5)] transition-all",
          selected ? "ring-2 ring-sky-300/80" : "ring-1 ring-white/10",
        ].join(" ")}
      >
        <div className="relative overflow-hidden rounded-[15px] border border-white/8 bg-slate-950/95 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_38%),linear-gradient(180deg,rgba(9,20,38,0.98),rgba(6,12,24,0.98))]" />
          <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-sky-500" />
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-300/90"
            style={{ left: -7 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-slate-950 !bg-sky-300/90"
            style={{ right: -7 }}
          />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 text-sky-200">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-300/35 bg-sky-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                    Codex Agent
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200/90">
                    {status.replaceAll("_", " ")}
                  </span>
                  {data.agentParentRunId ? (
                    <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                      Subagent
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-slate-300/88">
                  {started
                    ? `${roleLabels[role]} · ${data.agentEventCount ?? 0} events`
                    : "Give Codex a goal. The run executes through the local Codex app-server."}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="nodrag nopan inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-300/30 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Delete Codex agent node"
              title={running && started ? "Cancel the run before deleting this agent." : "Delete this agent node."}
              disabled={running && started}
              onClick={(event) => {
                event.stopPropagation();
                data.onAgentRemove?.();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-3 space-y-2">
            <label className="block text-xs text-slate-200">
              <span className="mb-1 block font-medium">Role</span>
              <select
                value={role}
                disabled={started}
                onChange={(event) => data.onAgentRoleChange?.(event.target.value as CodexAgentRole)}
                className="nodrag nowheel h-9 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2 text-xs text-slate-100 disabled:opacity-60"
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <textarea
              aria-label="Codex agent goal"
              rows={5}
              value={prompt}
              placeholder="Example: inspect the authentication flow, fix the failing tests, and explain the changes."
              disabled={started}
              onChange={(event) => data.onAgentPromptChange?.(event.target.value)}
              className="nodrag nowheel min-h-[112px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm leading-5 text-slate-50 outline-none placeholder:text-slate-400/80 focus:border-sky-300/55 disabled:cursor-not-allowed disabled:opacity-70"
            />

            {output ? (
              <div className="max-h-36 overflow-auto rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-200">
                {output}
              </div>
            ) : null}

            {data.agentError ? (
              <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">
                {data.agentError}
              </div>
            ) : null}

            {pendingApproval ? (
              <div className="rounded-xl border border-amber-300/35 bg-amber-400/10 p-3">
                <p className="text-xs font-semibold text-amber-100">Codex is waiting for approval.</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-100/80">
                  Review the requested action before allowing the agent to continue.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="nodrag bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                    onClick={() => data.onAgentApproval?.("accept")}
                  >
                    <Check className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="nodrag border-rose-300/35 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                    onClick={() => data.onAgentApproval?.("decline")}
                  >
                    <X className="mr-1.5 h-4 w-4" /> Decline
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative mt-3 flex flex-wrap justify-end gap-2">
            {started && data.onAgentSpawnChild ? (
              <Button
                type="button"
                variant="outline"
                className="nodrag border-violet-300/30 bg-violet-400/10 text-violet-100 hover:bg-violet-400/15"
                onClick={data.onAgentSpawnChild}
              >
                <GitBranchPlus className="mr-1.5 h-4 w-4" /> Subagent
              </Button>
            ) : null}
            {running && started ? (
              <Button
                type="button"
                variant="outline"
                className="nodrag border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
                onClick={data.onAgentCancel}
              >
                <Square className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            ) : null}
            {!started ? (
              <Button
                type="button"
                className="nodrag bg-sky-400 text-slate-950 hover:bg-sky-300"
                disabled={!canStart}
                onClick={data.onAgentStart}
              >
                <Play className="mr-1.5 h-4 w-4" /> Run agent
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);

CodexAgentRunNode.displayName = "CodexAgentRunNode";
