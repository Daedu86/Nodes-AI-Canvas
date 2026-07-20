"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  CheckCircle2,
  FilePenLine,
  ShieldQuestion,
  SquareTerminal,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const iconFor = (type: string | null | undefined) => {
  if (type?.startsWith("shell.")) return SquareTerminal;
  if (type === "file.changed") return FilePenLine;
  if (type?.startsWith("tool.")) return Wrench;
  if (type?.startsWith("approval.")) return ShieldQuestion;
  if (type === "run.failed" || type === "run.cancelled") return XCircle;
  if (type === "run.completed") return CheckCircle2;
  return Bot;
};

export const CodexAgentActivityNode = memo(
  ({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
    const Icon = iconFor(data.agentActivityType);
    const approvalRequested = data.agentActivityType === "approval.requested";

    return (
      <div
        className={[
          "relative ml-[500px] w-[300px] rounded-xl border bg-slate-950/94 px-3 py-2.5 shadow-[0_16px_44px_-30px_rgba(14,165,233,0.65)]",
          approvalRequested ? "border-amber-300/35 bg-amber-950/90" : "border-white/10",
          selected ? "ring-2 ring-sky-300/70" : "ring-1 ring-white/10",
        ].join(" ")}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-sky-300/90"
          style={{ left: -6 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-sky-300/90"
          style={{ right: -6 }}
        />
        <div className="flex items-start gap-2.5">
          <div className={[
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            approvalRequested
              ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
              : "border-sky-300/20 bg-sky-400/10 text-sky-100",
          ].join(" ")}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-slate-100">
                {data.title ?? "Agent activity"}
              </p>
              <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400">
                {data.agentActivityType ?? "event"}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 break-words text-[11px] leading-4 text-slate-300/85">
              {data.preview}
            </p>
            {approvalRequested ? (
              <p className="mt-2 text-[10px] font-medium text-amber-100/90">
                Respond from the approval panel inside the Codex Agent node.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);

CodexAgentActivityNode.displayName = "CodexAgentActivityNode";