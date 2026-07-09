"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SendHorizontal, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const DRAFT_ACCENT = "#0f766e";

export const CanvasPromptNode = memo(({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
  const detail = data.draftDetail;
  const text = data.draftText ?? "";
  const busy = Boolean(data.draftBusy);
  const disabled = Boolean(data.draftDisabled);
  const canSubmit = !disabled && !busy && text.trim().length > 0;
  const contextCount = data.draftContextCount ?? 0;

  return (
    <div
      className={[
        "group relative w-[380px] rounded-[28px] border bg-slate-950/95 p-[1px] shadow-[0_24px_60px_-34px_rgba(15,118,110,0.42)] transition-all duration-200",
        selected ? "ring-2 ring-emerald-300/80" : "ring-1 ring-white/10",
      ].join(" ")}
      style={{
        boxShadow: selected
          ? `0 24px 60px -30px ${DRAFT_ACCENT}66, 0 0 0 1px ${DRAFT_ACCENT}44`
          : undefined,
      }}
    >
      <div className="relative overflow-hidden rounded-[27px] border border-white/8 bg-slate-950/95 px-4 py-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.18),transparent_36%),linear-gradient(180deg,rgba(10,25,24,0.98),rgba(8,18,22,0.98))]" />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1.5 bg-emerald-500" />
        <div className="pointer-events-none absolute right-3 top-3 h-12 w-12 rounded-full bg-emerald-400/15 blur-2xl" />

        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-emerald-300/90"
          style={{ left: -7 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-emerald-300/90"
          style={{ right: -7 }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Draft prompt
              </span>
              {detail ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200/90">
                  {detail.title}
                </span>
              ) : null}
              {contextCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-violet-300/35 bg-violet-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                  {contextCount} ctx
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
              if (canSubmit) {
                data.onDraftSubmit?.();
              }
            }}
            className="nodrag nowheel min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm leading-5 text-slate-50 outline-none transition-colors placeholder:text-slate-400/80 focus:border-emerald-300/55 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="flex flex-col gap-2 text-[11px] text-slate-300/88 sm:flex-row sm:items-center sm:justify-between">
            <span>Enter sends, Shift+Enter adds newline</span>
            {data.draftRunInterruptionNote ? (
              <span className="text-amber-200">{data.draftRunInterruptionNote}</span>
            ) : null}
          </div>
          {data.draftError ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100"
            >
              {data.draftError}
            </div>
          ) : null}
          {!disabled ? null : (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              AI requests are disabled. Turn on the AI control in the header to send prompts.
            </div>
          )}
        </div>

        <div className="relative mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="nodrag pointer-events-auto w-full border border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white sm:w-auto"
            onClick={data.onDraftCancel}
            disabled={busy}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete draft
          </Button>
          {data.onDraftCancelRun ? (
            <Button
              type="button"
              variant="outline"
              className="nodrag pointer-events-auto w-full border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15 hover:text-amber-50 sm:w-auto"
              onClick={data.onDraftCancelRun}
              disabled={busy}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Cancel run
            </Button>
          ) : null}
          <Button
            type="button"
            className="nodrag pointer-events-auto w-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 sm:w-auto"
            onClick={data.onDraftSubmit}
            disabled={!canSubmit}
            aria-label="Send prompt node"
          >
            <SendHorizontal className="mr-1.5 h-4 w-4" />
            {busy
              ? "Sending..."
              : contextCount > 0
                ? `${detail?.submitLabel ?? "Send"} with context`
                : detail?.submitLabel ?? "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
});

CanvasPromptNode.displayName = "CanvasPromptNode";
