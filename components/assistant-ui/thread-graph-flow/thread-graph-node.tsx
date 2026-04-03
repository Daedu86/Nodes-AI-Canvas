"use client";

import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getGraphModelLabel, getGraphModelPalette } from "@/components/assistant-ui/thread-graph/graph-models";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const pillClass =
  "inline-flex items-center rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]";

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
        "radial-gradient(circle at top right, rgba(96,165,250,0.2), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))",
      glow: "shadow-[0_20px_50px_-30px_rgba(37,99,235,0.42)]",
      roleLabel: "Entry",
      toneLabel: "Conversation root",
    };
  }

  if (data.kind === "bridge" || data.isBridge) {
    return {
      background:
        "radial-gradient(circle at top right, rgba(251,191,36,0.16), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,251,235,0.96))",
      glow: "shadow-[0_18px_42px_-28px_rgba(245,158,11,0.3)]",
      roleLabel: "Bridge",
      toneLabel: "Shared branch",
    };
  }

  if (data.role === "assistant") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(125,211,252,0.18), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,249,255,0.95))",
      glow: "shadow-[0_18px_42px_-28px_rgba(14,165,233,0.28)]",
      roleLabel: "Assistant",
      toneLabel: "AI reply",
    };
  }

  if (data.role === "user") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(226,232,240,0.9), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,252,0.96))",
      glow: "shadow-[0_18px_42px_-28px_rgba(15,23,42,0.22)]",
      roleLabel: "Prompt",
      toneLabel: "User input",
    };
  }

  return {
    background:
      "radial-gradient(circle at top right, rgba(255,255,255,0.88), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.9))",
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
  const selectedRing = selected ? "ring-2 ring-sky-400/70" : "ring-1 ring-border/50";
  const draggingLift = dragging ? "scale-[1.015]" : "scale-100";
  const emphasis = data.emphasis ?? "normal";
  const isMuted = emphasis === "muted";
  const isLineage = emphasis === "lineage";
  const isSelected = emphasis === "selected" || selected;

  return (
    <div
      className={[
        "group relative min-w-[280px] max-w-[340px] rounded-[28px] border bg-background/95 p-[1px] transition-all duration-200",
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
      <div className="relative overflow-hidden rounded-[27px] border border-border/40 bg-background/95 px-4 py-3">
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
          className="!h-3 !w-3 !border-2 !border-background !bg-slate-500/90"
          style={{ left: -7 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-slate-500/90"
          style={{ right: -7 }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={pillClass} style={{ borderColor: `${accent}55`, color: accent }}>
                {tone.roleLabel}
              </span>
              {isBridge ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                  Bridge
                </span>
              ) : null}
              {data.editedFromId ? (
                <span className="inline-flex items-center rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Edited
                </span>
              ) : null}
              {isCut ? (
                <span className="inline-flex items-center rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                  Cut
                </span>
              ) : null}
              {branchLabel ? (
                <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {branchLabel}
                </span>
              ) : null}
              {typeof data.linkedArtifactCount === "number" && data.linkedArtifactCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                  {data.linkedArtifactCount} ctx
                </span>
              ) : null}
              {data.statusLabel ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  {data.statusLabel}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {modelLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span>{modelLabel}</span>
                </span>
              ) : null}
              {providerLabel ? (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
                  {providerLabel}
                </span>
              ) : null}
              {typeof data.depth === "number" ? (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
                  D{data.depth}
                </span>
              ) : null}
            </div>
          </div>

            <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{tone.toneLabel}</span>
              {typeof data.idx === "number" ? <span>#{String(data.idx).padStart(2, "0")}</span> : null}
              {isSelected ? (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-700">
                Focus
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3">
          <p className="line-clamp-3 text-sm leading-5 text-foreground/90">{preview}</p>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {isRoot ? (
            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-sky-700">
              Conversation entry
            </span>
          ) : null}
          {data.editedFromId ? (
            <span className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5">
              from {data.editedFromId.slice(0, 8)}
            </span>
          ) : null}
          {!isRoot && !isBridge && !data.editedFromId ? (
            <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
              live branch
            </span>
          ) : null}
          {isLineage ? (
            <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-violet-700">
              lineage
            </span>
          ) : null}
          {isCut ? (
            <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-rose-700">
              disconnected
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

ThreadGraphNode.displayName = "ThreadGraphNode";
