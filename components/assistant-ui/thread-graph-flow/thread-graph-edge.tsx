"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Position,
} from "@xyflow/react";
import { Scissors } from "lucide-react";
import type {
  ThreadGraphFlowEdge,
  ThreadGraphFlowEdgeData,
} from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const getBadgeTone = (data?: ThreadGraphFlowEdgeData) => {
  if (data?.isEdited || data?.tone === "edited") {
    return { border: "border-sky-500/35", bg: "bg-sky-500/10", text: "text-sky-700", label: data?.label ?? "edited" };
  }
  if (data?.isBridge || data?.tone === "bridge") {
    return { border: "border-amber-500/35", bg: "bg-amber-500/10", text: "text-amber-700", label: data?.label ?? "bridge" };
  }
  if (data?.tone === "context") {
    return { border: "border-violet-500/35", bg: "bg-violet-500/10", text: "text-violet-700", label: data?.label ?? "context" };
  }
  if (data?.tone === "pending-output") {
    return { border: "border-cyan-500/35", bg: "bg-cyan-500/10", text: "text-cyan-700", label: data?.label ?? "pending output" };
  }
  if (data?.tone === "output") {
    return { border: "border-cyan-500/35", bg: "bg-cyan-500/10", text: "text-cyan-700", label: data?.label ?? "output" };
  }
  if (data?.tone === "draft") {
    return { border: "border-emerald-500/35", bg: "bg-emerald-500/10", text: "text-emerald-700", label: data?.label ?? "draft" };
  }
  return data?.label
    ? { border: "border-border/60", bg: "bg-background/85", text: "text-muted-foreground", label: data.label }
    : null;
};

const isDashed = (data?: ThreadGraphFlowEdgeData) =>
  Boolean(
    data?.linkEditMode ||
      data?.tone === "context" ||
      data?.tone === "draft" ||
      data?.tone === "pending-output",
  );

export const ThreadGraphEdge = memo(
  ({
    id,
    markerEnd,
    source,
    sourceX,
    sourceY,
    sourcePosition,
    target,
    targetPosition,
    targetX,
    targetY,
    data,
    selected,
  }: EdgeProps<ThreadGraphFlowEdge>) => {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePosition as Position,
      targetPosition: targetPosition as Position,
      targetX,
      targetY,
      borderRadius: 18,
      offset: 16,
    });
    const accent = data?.accent ?? "#64748b";
    const badge = getBadgeTone(data);
    const emphasis = data?.emphasis ?? "normal";
    const isMuted = emphasis === "muted";
    const isLineage = emphasis === "lineage";
    const isSelected = emphasis === "selected" || selected;
    const isEditMode = Boolean(data?.linkEditMode && data?.editable);
    const renderHighlight = isSelected || isLineage || isEditMode;
    const outerWidth = isSelected ? 3.4 : isLineage ? 2.8 : 2.2;

    return (
      <>
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          className="thread-graph-edge-hitbox"
          data-edge-id={id}
          data-edge-source={source}
          data-edge-target={target}
          data-edge-label={data?.label ?? ""}
          data-edge-tone={data?.tone ?? "default"}
          style={{ pointerEvents: "stroke" }}
        />
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          style={{
            stroke: accent,
            strokeOpacity: isMuted ? 0.07 : isSelected ? 0.98 : isLineage ? 0.86 : 0.72,
            strokeWidth: outerWidth,
            strokeDasharray: isDashed(data) ? "10 8" : undefined,
            filter: isSelected ? `drop-shadow(0 0 5px ${accent}44)` : "none",
          }}
        />
        {renderHighlight ? (
          <BaseEdge
            id={`${id}-highlight`}
            path={path}
            markerEnd={markerEnd}
            style={{
              stroke: "rgba(255,255,255,0.74)",
              strokeOpacity: isMuted ? 0.04 : isSelected ? 0.88 : 0.62,
              strokeWidth: isSelected ? 1.5 : 1,
              strokeDasharray: isEditMode ? "4 8" : undefined,
            }}
          />
        ) : null}
        {badge ? (
          <EdgeLabelRenderer>
            <div
              className={[
                "pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm",
                badge.border,
                badge.bg,
                badge.text,
              ].join(" ")}
              style={{ transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
              <span>{badge.label}</span>
            </div>
          </EdgeLabelRenderer>
        ) : null}
        {isEditMode ? (
          <EdgeLabelRenderer>
            <button
              type="button"
              className="pointer-events-auto absolute z-[60] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-rose-500/35 bg-background/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 shadow-sm hover:bg-rose-500/10"
              style={{ transform: `translate(${labelX}px, ${labelY + (badge ? 22 : 0)}px) translate(-50%, -50%)` }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data?.onCut?.();
              }}
            >
              <Scissors className="h-3 w-3" />
              <span>Cut link</span>
            </button>
          </EdgeLabelRenderer>
        ) : null}
      </>
    );
  },
);

ThreadGraphEdge.displayName = "ThreadGraphEdge";
