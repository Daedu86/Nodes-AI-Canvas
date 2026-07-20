"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pause, SendHorizontal, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

export const CanvasPromptNode = memo(({ data, selected }: NodeProps<ThreadGraphFlowNode>) => {
  const persistent = data.kind === "canvas-prompt";
  const detail = data.draftDetail;
  const text = data.draftText ?? "";
  const status = data.promptStatus ?? (data.draftBusy ? "running" : "idle");
  const busy = status === "running" || status === "queued" || Boolean(data.draftBusy);
  const disabled = Boolean(data.draftDisabled);
  const contextScope = data.draftContextScope ?? null;
  const canSubmit = !disabled && !busy && text.trim().length > 0 && (persistent || contextScope !== null);
  const contextCount = data.draftContextCount ?? 0;
  const outputCount = data.draftOutputCount ?? 0;
  const canPause = status === "running" && Boolean(data.onDraftCancelRun);
  const canCancelQueued = status === "queued" && Boolean(data.onDraftCancelRun);

  const handleDelete = () => {
    const confirmed = window.confirm(
      persistent
        ? "Delete this prompt node and all of its canvas connections?"
        : "Delete this draft prompt node?",
    );
    if (confirmed) data.onDraftCancel?.();
  };

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

        <button
          type="button"
          className="nodrag nopan absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/30 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={persistent ? "Delete prompt node" : "Delete draft prompt node"}
          title={busy ? "Pause or cancel the active run before deleting this prompt." : "Delete this prompt node."}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            handleDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="relative flex items-start justify-between gap-3 pr-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                {persistent ? "Prompt" : "Draft prompt"}
              </span>
              {persistent ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200/90">
                  {status}
                </span>
              ) : detail ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-200/90">
                  {detail.title}
                </span>
              ) : null}
              {contextCount > 0 ? (
                <span className="rounded-full border border-violet-300/35 bg-violet-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                  {!persistent && contextScope ? `${contextCount} messages` : `${contextCount} in`}
                </span>
              ) : null}
              {outputCount > 0 ? (
                <span className="rounded-full border border-cyan-300/35 bg-cyan-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                  {outputCount} out
                </span>
              ) : null}
            </div>
            <p className="text-[11px] leading-5 text-slate-300/88">
              {persistent
                ? "Runs independently from chat. Each completed run creates a separate Assistant node."
                : detail?.description ?? "Write a prompt directly on the canvas."}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300/90">
            Editable
          </span>
        </div>

        <div className="relative mt-3 space-y-2">
          {!persistent ? (
            <label className="block text-xs text-slate-200">
              <span className="mb-1 block font-medium">Context required</span>
              <select
                value={contextScope ?? ""}
                onChange={(event) =>
                  data.onDraftContextScopeChange?.(
                    event.target.value as "parent" | "branch" | "tree",
                  )
                }
                className="nodrag nowheel h-9 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2 text-xs text-slate-100"
              >
                <option value="" disabled>
                  Select context before running
                </option>
                <option value="parent">Parent message</option>
                <option value="branch">Branch lineage</option>
                <option value="tree">Full tree</option>
              </select>
            </label>
          ) : null}
          <textarea
            aria-label={persistent ? "Canvas prompt" : "Draft prompt"}
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
            {data.draftRunInterruptionNote ? (
              <span className="text-amber-200">{data.draftRunInterruptionNote}</span>
            ) : null}
          </div>
          {data.draftError ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100"
            >
              {data.draftError}
            </div>
          ) : null}
          {!persistent && !contextScope ? (
            <p className="text-xs text-amber-200">Choose context to enable Run.</p>
          ) : null}
          {disabled ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              AI requests are disabled. Enable AI in the header to run this prompt.
            </div>
          ) : null}
        </div>

        <div className="relative mt-3 flex justify-end gap-2">
          {canPause ? (
            <Button
              type="button"
              variant="outline"
              className="nodrag border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
              onClick={data.onDraftCancelRun}
              aria-label="Pause active LLM run"
              title="Pause this run by interrupting the active LLM request. Run again to restart it."
            >
              <Pause className="mr-1.5 h-4 w-4" /> Pause
            </Button>
          ) : canCancelQueued ? (
            <Button
              type="button"
              variant="outline"
              className="nodrag border-amber-300/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
              onClick={data.onDraftCancelRun}
              aria-label="Cancel queued LLM run"
            >
              <XCircle className="mr-1.5 h-4 w-4" /> Cancel queued
            </Button>
          ) : null}
          <Button
            type="button"
            className="nodrag bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            onClick={data.onDraftSubmit}
            disabled={!canSubmit}
            aria-label={persistent ? "Run canvas prompt" : "Send prompt node"}
          >
            <SendHorizontal className="mr-1.5 h-4 w-4" />
            {status === "queued"
              ? "Queued"
              : status === "running"
                ? "Running..."
                : outputCount > 0
                  ? `Run → ${outputCount}`
                  : "Run"}
          </Button>
        </div>
      </div>
    </div>
  );
});

CanvasPromptNode.displayName = "CanvasPromptNode";
