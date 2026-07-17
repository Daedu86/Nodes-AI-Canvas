"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

export const CanvasResponseNode = memo(
  ({ data, selected }: NodeProps<ThreadGraphFlowNode>) => (
    <div
      className={[
        "group relative w-[340px] rounded-2xl border bg-slate-950/95 p-px shadow-[0_24px_60px_-34px_rgba(37,99,235,0.42)] transition-all",
        selected ? "ring-2 ring-blue-300/80" : "ring-1 ring-white/10",
      ].join(" ")}
    >
      <div className="relative overflow-hidden rounded-[15px] border border-white/8 bg-slate-950/95 px-4 py-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_36%),linear-gradient(180deg,rgba(8,18,35,0.98),rgba(5,12,26,0.98))]" />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-blue-500" />
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-blue-300/90"
          style={{ left: -7 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-blue-300/90"
          style={{ right: -7 }}
        />

        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-300/35 bg-blue-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100">
                <Bot className="h-3 w-3" /> Assistant
              </span>
              {data.modelLabel ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-200/90">
                  {data.modelLabel}
                </span>
              ) : null}
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300/90">
              Result
            </span>
          </div>

          <div className="nowheel max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm leading-5 text-slate-100">
            {data.preview}
          </div>
        </div>
      </div>
    </div>
  ),
);

CanvasResponseNode.displayName = "CanvasResponseNode";
