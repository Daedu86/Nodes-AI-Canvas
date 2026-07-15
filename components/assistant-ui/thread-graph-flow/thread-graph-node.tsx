"use client";

import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BranchOperation } from "@/lib/thread-branching";
import { getGraphModelLabel, getGraphModelPalette } from "@/components/assistant-ui/thread-graph/graph-models";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const pillClass =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]";

const formatBranchLabel = (branchId?: string | number | null) => {
  if (branchId == null || branchId === "") return null;
  const text = String(branchId);
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text;
};

const getPreview = (value: string) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No content";
  return compact.length > 150 ? `${compact.slice(0, 147)}...` : compact;
};

const getNodeTone = (data: ThreadGraphFlowNode["data"]) => {
  if (data.kind === "root" || data.isRoot) {
    return {
      background:
        "radial-gradient(circle at top right, rgba(96,165,250,0.18), transparent 36%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(12,19,34,0.98))",
      glow: "shadow-[0_22px_52px_-30px_rgba(37,99,235,0.34)]",
      roleLabel: "Entry",
      toneLabel: "Conversation root",
    };
  }

  if (data.kind === "bridge" || data.isBridge) {
    return {
      background:
        "radial-gradient(circle at top right, rgba(251,191,36,0.16), transparent 36%), linear-gradient(180deg, rgba(35,24,10,0.98), rgba(24,18,10,0.98))",
      glow: "shadow-[0_18px_42px_-28px_rgba(245,158,11,0.28)]",
      roleLabel: "Bridge",
      toneLabel: "Shared branch",
    };
  }

  if (data.role === "assistant") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(56,189,248,0.16), transparent 36%), linear-gradient(180deg, rgba(12,19,34,0.98), rgba(10,15,27,0.98))",
      glow: "shadow-[0_18px_42px_-28px_rgba(14,165,233,0.24)]",
      roleLabel: "Assistant",
      toneLabel: "AI reply",
    };
  }

  if (data.role === "user") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(148,163,184,0.14), transparent 36%), linear-gradient(180deg, rgba(22,25,34,0.98), rgba(16,18,26,0.98))",
      glow: "shadow-[0_18px_42px_-28px_rgba(15,23,42,0.28)]",
      roleLabel: "Prompt",
      toneLabel: "User input",
    };
  }

  return {
    background:
      "radial-gradient(circle at top right, rgba(148,163,184,0.12), transparent 36%), linear-gradient(180deg, rgba(20,23,31,0.98), rgba(15,17,24,0.98))",
    glow: "shadow-[0_18px_42px_-28px_rgba(15,23,42,0.28)]",
    roleLabel: data.role || "Node",
    toneLabel: "Conversation node",
  };
};

export const ThreadGraphNode = memo(({ data, selected, dragging }: NodeProps<ThreadGraphFlowNode>) => {
  const isRoot = Boolean(data.isRoot || data.kind === "root");
  const isBridge = Boolean(data.isBridge || data.kind === "bridge");
  const isCut = Boolean(data.isCut);
  const modelLabel = data.modelLabel ?? getGraphModelLabel(data.model, data.provider);
  const providerLabel = data.providerLabel ?? (data.provider ? data.provider.replace(/^@?/, "") : null);
  const palette = getGraphModelPalette({
    defaultFill: "rgba(255,255,255,0.94)",
    defaultStroke: "rgba(15,23,42,0.08)",
    isDarkBg: false,
    model: data.model,
    provider: data.provider,
  });
  const accent = data.accent ?? palette.swatch;
  const branchLabel = formatBranchLabel(data.branchId);
  const preview = getPreview(data.preview);
  const tone = getNodeTone(data);
  const selectedRing = selected ? "ring-2 ring-sky-400/70" : "ring-1 ring-white/10";
  const draggingLift = dragging ? "scale-[1.015]" : "scale-100";
  const emphasis = data.emphasis ?? "normal";
  const isMuted = emphasis === "muted";
  const isLineage = emphasis === "lineage";
  const isSelected = emphasis === "selected" || selected;
  const branchAction: { label: string; operation: BranchOperation } | null =
    isRoot
      ? { label: "Create root branch", operation: "new-root-prompt" }
      : data.role === "user"
        ? { label: "Create sibling branch", operation: "create-sibling-prompt" }
        : data.role === "assistant"
          ? { label: "Create follow-up message", operation: "create-follow-up-prompt" }
          : null;

  return (
    <div
      className={[
        "group relative min-w-[280px] max-w-[340px] rounded-[28px] border bg-background/95 p-[1px] transition-all duration-200",
        "border-white/10 bg-slate-950/95",
        selectedRing,
        tone.glow,
        draggingLift,
        isMuted ? "scale-[0.985] opacity-20 saturate-50" : "",
        isLineage ? "opacity-95" : "",
        isSelected ? "scale-[1.01]" : "",
      ].join(" ")}
      style={{
        boxShadow: isSelected ? `0 24px 60px -30px ${accent}66, 0 0 0 1px ${accent}33` : undefined,
      } as CSSProperties}
    >
      <div className="relative overflow-hidden rounded-[27px] border border-white/8 bg-slate-950/95 px-4 py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage: tone.background,
          }}
        />
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-1.5"
          style={{ backgroundColor: accent }}
        />
        <div
          className="pointer-events-none absolute right-3 top-3 h-10 w-10 rounded-full blur-2xl"
          style={{ backgroundColor: accent, opacity: 0.14 }}
        />

        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-slate-300/90"
          style={{ left: -7 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-slate-300/90"
          style={{ right: -7 }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={pillClass}
                style={{
                  backgroundColor: `${accent}14`,
                  borderColor: `${accent}33`,
                  color: accent,
                }}
              >
                {tone.roleLabel}
              </span>
              {isBridge ? (
                <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                  Bridge
                </span>
              ) : null}
              {data.editedFromId ? (
                <span className="inline-flex items-center rounded-full border border-sky-400/35 bg-sky-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Edited
                </span>
              ) : null}
              {isCut ? (
                <span className="inline-flex items-center rounded-full border border-rose-400/35 bg-rose-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">
                  Cut
                </span>
              ) : null}
              {branchLabel ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-200/90">
                  {branchLabel}
                </span>
              ) : null}
              {typeof data.linkedArtifactCount === "number" && data.linkedArtifactCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
                  {data.linkedArtifactCount} ctx
                </span>
              ) : null}
              {data.statusLabel ? (
                <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                  {data.statusLabel}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-200/88">
              {modelLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span>{modelLabel}</span>
                </span>
              ) : null}
              {providerLabel ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                  {providerLabel}
                </span>
              ) : null}
              {typeof data.depth === "number" ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                  D{data.depth}
                </span>
              ) : null}
            </div>
          </div>

            <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.18em] text-slate-300/90">
              <span>{tone.toneLabel}</span>
              {typeof data.idx === "number" ? <span>#{String(data.idx).padStart(2, "0")}</span> : null}
              {isSelected ? (
                <span className="rounded-full border border-sky-400/35 bg-sky-400/12 px-2 py-0.5 text-sky-200">
                Focus
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3">
          <p className="line-clamp-3 text-sm leading-5 text-slate-100">{preview}</p>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-200/88">
          {isRoot ? (
            <span className="rounded-full border border-sky-400/25 bg-sky-400/12 px-2 py-0.5 text-sky-200">
              Conversation entry
            </span>
          ) : null}
          {data.editedFromId ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
              from {data.editedFromId.slice(0, 8)}
            </span>
          ) : null}
          {!isRoot && !isBridge && !data.editedFromId ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
              live branch
            </span>
          ) : null}
          {isLineage ? (
            <span className="rounded-full border border-violet-400/25 bg-violet-400/12 px-2 py-0.5 text-violet-200">
              lineage
            </span>
          ) : null}
          {isCut ? (
            <span className="rounded-full border border-rose-400/25 bg-rose-400/12 px-2 py-0.5 text-rose-200">
              disconnected
            </span>
          ) : null}
        </div>
        {!isBridge && data.onContextScopeChange ? (
          <label className="nodrag nopan relative mt-3 block text-[11px] text-slate-300">
            <span className="mb-1 block font-medium uppercase tracking-[0.14em]">Context</span>
            <select
              value={data.contextScope ?? ""}
              onChange={(event) =>
                data.onContextScopeChange?.(
                  event.target.value as "parent" | "branch" | "tree",
                )
              }
              className="nowheel h-8 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2 text-xs text-slate-100"
            >
              <option value="" disabled>Select context</option>
              <option value="parent" disabled={isRoot}>Parent message</option>
              <option value="branch">Branch lineage</option>
              <option value="tree">Full tree</option>
            </select>
          </label>
        ) : null}
        {branchAction && data.onBranchOperation ? (
          <button
            type="button"
            className="nodrag nopan relative mt-3 inline-flex items-center rounded-full border border-sky-400/35 bg-sky-400/12 px-3 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:bg-sky-400/20"
            onClick={(event) => {
              event.stopPropagation();
              data.onBranchOperation?.(branchAction.operation);
            }}
          >
            {branchAction.label}
          </button>
        ) : null}
        {isRoot && (data.onToggleLinkEdit || data.onCopyGraphJson) ? (
          <div className="nodrag nopan relative mt-3 flex flex-wrap gap-2">
            {data.onToggleLinkEdit ? <button type="button" className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-100 hover:bg-white/[0.1]" onClick={(event) => { event.stopPropagation(); data.onToggleLinkEdit?.(); }}>Edit links</button> : null}
            {data.onCopyGraphJson ? <button type="button" className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-100 hover:bg-white/[0.1]" onClick={(event) => { event.stopPropagation(); data.onCopyGraphJson?.(); }}>Copy JSON</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

ThreadGraphNode.displayName = "ThreadGraphNode";
