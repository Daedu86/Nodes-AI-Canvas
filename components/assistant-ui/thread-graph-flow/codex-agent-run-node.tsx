"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranchPlus,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodexAgentRole } from "@/lib/agents/codex/types";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const RUNNING_STATUSES = new Set(["queued", "running", "waiting_for_approval"]);
const CODEX_MODEL = process.env.NEXT_PUBLIC_CODEX_MODEL?.trim() || "gpt-5.6-sol";

const roleLabels: Record<CodexAgentRole, string> = {
  coder: "Coder",
  reviewer: "Reviewer",
  researcher: "Researcher",
  tester: "Tester",
  custom: "Custom",
};

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting_for_approval: "Needs approval",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const CodexAgentRunNode = memo(
  ({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
    const status = data.agentStatus ?? "queued";
    const role = data.agentRole ?? "coder";
    const prompt = data.agentPrompt ?? "";
    const output = data.agentOutput ?? "";
    const running = RUNNING_STATUSES.has(status);
    const started = Boolean(data.agentRunId);
    const completed = status === "completed";
    const canStart = !started && prompt.trim().length > 0;
    const pendingApproval = data.agentPendingApprovalId;
    const [responseExpanded, setResponseExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyOutput = async () => {
      if (!output) return;
      try {
        await navigator.clipboard.writeText(output);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        setCopied(false);
      }
    };

    return (
      <div
        className={[
          "group relative w-[430px] rounded-2xl border bg-slate-950/95 p-px shadow-[0_24px_60px_-34px_rgba(59,130,246,0.5)] transition-all",
          selected ? "ring-2 ring-sky-300/80" : "ring-1 ring-white/10",
        ].join(" ")}
      >
        <div className="relative overflow-hidden rounded-[15px] border border-white/8 bg-slate-950/95 px-4 py-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,rgba(9,20,38,0.98),rgba(6,12,24,0.98))]" />
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/25 bg-sky-400/10 text-sky-200">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-300/35 bg-sky-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                    Codex Agent
                  </span>
                  <span className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-indigo-100">
                    LLM · {CODEX_MODEL}
                  </span>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      completed
                        ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                        : "border-white/10 bg-white/[0.04] text-slate-200/90",
                    ].join(" ")}
                  >
                    {statusLabels[status] ?? status.replaceAll("_", " ")}
                  </span>
                  {data.agentParentRunId ? (
                    <span className="rounded-full border border-violet-300/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                      Subagent
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-300/85">
                  <span className="font-medium text-slate-100">{roleLabels[role]}</span>
                  {started ? <span>· {data.agentEventCount ?? 0} events</span> : null}
                  {!started ? <span>· Ready for a general task</span> : null}
                </div>
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

          <div className="relative mt-4 space-y-3">
            <label className="block text-xs text-slate-200">
              <span className="mb-1.5 block font-medium">Role</span>
              <select
                value={role}
                disabled={started}
                onChange={(event) => data.onAgentRoleChange?.(event.target.value as CodexAgentRole)}
                className="nodrag nowheel h-10 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs text-slate-100 disabled:opacity-60"
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-200">
              <span className="mb-1.5 block font-medium">Task</span>
              <textarea
                aria-label="Codex agent task"
                rows={5}
                value={prompt}
                placeholder="Example: research a topic, analyze a document, prepare a plan, or complete another multi-step task."
                disabled={started}
                onChange={(event) => data.onAgentPromptChange?.(event.target.value)}
                className="nodrag nowheel min-h-[124px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm leading-5 text-slate-50 outline-none placeholder:text-slate-400/80 focus:border-sky-300/55 disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            {output ? (
              <section className="overflow-hidden rounded-xl border border-sky-300/20 bg-sky-950/30">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100">Agent response</p>
                      <p className="truncate text-[10px] text-slate-400">
                        {completed ? "Final result" : "Live output"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyOutput();
                      }}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        setResponseExpanded((value) => !value);
                      }}
                    >
                      {responseExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {responseExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>
                <div
                  className={[
                    "nodrag nowheel overflow-auto whitespace-pre-wrap break-words px-3 py-3 text-sm leading-6 text-slate-100",
                    responseExpanded ? "max-h-[440px]" : "max-h-52",
                  ].join(" ")}
                >
                  {output}
                </div>
              </section>
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

          <div className="relative mt-4 flex flex-wrap justify-end gap-2 border-t border-white/8 pt-3">
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
