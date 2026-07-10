"use client";

import { memo } from "react";
import { Braces, File, FileText, ImageIcon, Link2, Pause, RotateCcw, Table2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  getArtifactBadgeLabel,
  getArtifactHeadline,
  getArtifactHighlights,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";

const previewText = (value: string) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "Empty artifact";
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
};

export const ArtifactGraphNode = memo(({ data, selected, dragging }: NodeProps<ThreadGraphFlowNode>) => {
  const artifactType = data.artifactType ?? "text";
  const semanticType = data.semanticType ?? null;
  const isTable = artifactType === "text" && semanticType === "table";
  const accent =
    data.accent ??
    (artifactType === "code"
      ? "#059669"
      : artifactType === "image"
        ? "#db2777"
        : artifactType === "file"
          ? "#2563eb"
          : isTable
            ? "#0891b2"
            : "#64748b");
  const Icon =
    artifactType === "code"
      ? Braces
      : artifactType === "image"
        ? ImageIcon
        : artifactType === "file"
          ? File
          : isTable
            ? Table2
            : FileText;
  const artifactLike = {
    artifactType,
    semanticType,
    title: data.title ?? "",
    content: data.preview,
    fileName: data.fileName ?? null,
    language: data.language ?? null,
    mimeType: data.mimeType ?? null,
    byteSize: data.byteSize ?? null,
  };
  const headline = getArtifactHeadline(artifactLike);
  const highlights = getArtifactHighlights(artifactLike, 3);
  const statChips = getArtifactStatChips(artifactLike);
  const revisionCount = data.revisionCount ?? 0;
  const syncMode = data.syncMode ?? "auto";

  return (
    <div
      className={[
        "group relative min-w-[300px] max-w-[340px] rounded-2xl border bg-background p-px shadow-[0_18px_42px_-30px_rgba(15,23,42,0.4)] transition-all",
        selected ? "ring-2 ring-ring/60" : "ring-1 ring-border/50",
        dragging ? "scale-[1.01]" : "",
      ].join(" ")}
    >
      <div className="relative overflow-hidden rounded-[15px] border border-border/60 bg-background px-4 py-3">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1" style={{ backgroundColor: accent }} />
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background"
          style={{ left: -7, backgroundColor: accent }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background"
          style={{ right: -7, backgroundColor: accent }}
        />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: accent, borderColor: `${accent}45`, backgroundColor: `${accent}10` }}
                >
                  <Icon className="h-3 w-3" />
                  {getArtifactBadgeLabel(artifactLike)}
                </span>
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {syncMode === "paused" ? (
                    <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" /> paused</span>
                  ) : (
                    "auto sync"
                  )}
                </span>
                {revisionCount > 0 ? (
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {revisionCount} rev
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm font-semibold text-foreground">{data.title ?? "Untitled artifact"}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Link2 className="h-3 w-3" />
              {data.linkedArtifactCount ?? 0}
            </span>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
            {artifactType === "image" && data.sourceDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={data.title ?? "Image artifact"} src={data.sourceDataUrl} className="h-28 w-full rounded-lg object-cover" />
            ) : isTable ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-foreground/85">
                {data.preview || "Connect a response to populate this table."}
              </pre>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-medium leading-5 text-foreground">{headline}</p>
                {highlights.length > 0 ? (
                  highlights.map((line) => (
                    <p key={line} className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">{previewText(data.preview)}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {statChips.slice(0, 3).map((chip) => (
              <span key={chip} className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {chip}
              </span>
            ))}
            {revisionCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                <RotateCcw className="h-3 w-3" /> history
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

ArtifactGraphNode.displayName = "ArtifactGraphNode";
