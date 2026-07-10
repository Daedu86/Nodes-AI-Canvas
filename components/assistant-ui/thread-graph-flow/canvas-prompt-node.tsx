"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SendHorizontal, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

export const CanvasPromptNode = memo(({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
  const detail = data.draftDetail;
  const text = data.draftText ?? "";
  const busy = Boolean(data.draftBusy);
  const disabled = Boolean(data.draftDisabled);
  const canSubmit = !disabled && !busy && text.trim().length > 0;
  const contextCount = data.draftContextCount ?? 0;
  const outputCount = data.draftOutputCount ?? 0;

  return (
    <div
      className={[
        "group relative w-[380px] rounded-2xl border bg-slate-950/95 p-px shadow-[0_24px_60px_-34px_rgba(15,118,110,0.42)] transition-all",
        selected ? "ring-2 ring-emerald-300/80" : "ring-1 ring-white/10",
      ].join(" ")}
    >
      <div className="relative overflow-hidden rounded-[15px] border border-white/8 bg-slate-950/95 px-4 py-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.18),transparent_36%),linear-gradient(180deg,rgba(10,25,24,0.98),rgba(8,18,22,0.98))]" />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-emerald-500" />
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-emerald-300/90" style={{ left: -7 }} />
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-slate-950 !bg-emerald-300/90" style={{ right: -7 }} />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Draft prompt
              </span>
              {detail ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-200/90">
                  {detail.title}
                </span>
              ) : null}
              {contextCount > 0 ? (
                <span className="rounded-full border border-violet-300/35 bg-violet-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                  {contextCount} in
                </span>
              ) : null}
              {outputCount > 0 ? (
                <span className="rounded-full border border-cyan-300/35 bg-cyan-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                  {outputCount} out
                </span>
              ) : null}
            </div>
            <p className="text-[11px] leading-5 text-slate-300/88">
              {detail?.description ?? "Write a prompt directly on the canvas."}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300/90">
            Editable
          </span>
        </div>

        <div className="relative mt-3 space-y-2">
          <textarea
            aria-label="Draft prompt"
            rows={5}
            value={text}
            placeholder={detail?.placeholder ?? "Write a prompt..."}
            disabled={disabled || busy}
            onChange={(event) => data.onDraftTextChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (canSubmit) data.onDraftSubmit?.();
            }}
            className="nodrag nowheel min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm leading-5 text-slate-50 outline-none placeholder:text-slate-400/80 focus:border-emerald-300/55 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="flex justify-between gap-2 text-[11px] text-slate-300/88">
            <span>Enter sends, Shift+Enter adds newline</span>
            {data.draftRunInterruptionNote ? <span className="text-amber-200">{data.draftRunInterruptionNote}</span> : null}
          </div>
          {data.draftError ? (
            <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">
              {data.draftError}
            </div>
          ) : null}
          {disabled ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              AI requests are disabled. Enable AI in the header to run this prompt.
            </div>
          ) : null}
        </div>

        <div className="relative mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" className="nodrag border border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]" onClick={data.onDraftCancel} disabled={busy}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete draft
          </Button>
          {data.onDraftCancelRun ? (
            <Button type="button" variant="outline" className="nodrag border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15" onClick={data.onDraftCancelRun} disabled={busy}>
              <XCircle className="mr-1.5 h-4 w-4" /> Cancel run
            </Button>
          ) : null}
          <Button type="button" className="nodrag bg-emerald-400 text-slate-950 hover:bg-emerald-300" onClick={data.onDraftSubmit} disabled={!canSubmit} aria-label="Send prompt node">
            <SendHorizontal className="mr-1.5 h-4 w-4" />
            {busy ? "Running..." : outputCount > 0 ? `Run → ${outputCount}` : "Run"}
          </Button>
        </div>
      </div>
    </div>
  );
});

CanvasPromptNode.displayName = "CanvasPromptNode";
