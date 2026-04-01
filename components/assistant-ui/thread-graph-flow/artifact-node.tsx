"use client";

import { memo } from "react";
import { Code2, File, FileImage, FileText, ImageIcon, Link2, Move } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ThreadGraphFlowNode } from "@/components/assistant-ui/thread-graph-flow/thread-graph-flow-types";
import { PROJECT_MEMORY_META } from "@/lib/project-memory-meta";

const previewText = (value: string) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "Empty artifact";
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
};

const formatByteSize = (byteSize?: number | null) => {
  if (!byteSize || byteSize <= 0) return null;
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(byteSize >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

export const ArtifactGraphNode = memo(({ data, selected, dragging }: NodeProps<ThreadGraphFlowNode>) => {
  const artifactType = data.artifactType ?? "text";
  const memoryMeta = data.memoryType ? PROJECT_MEMORY_META[data.memoryType] : null;
  const isCode = artifactType === "code";
  const isImage = artifactType === "image";
  const isFile = artifactType === "file";
  const accent = memoryMeta?.accent ?? (isCode ? "#0f766e" : isImage ? "#db2777" : isFile ? "#2563eb" : "#7c3aed");
  const Icon = isCode ? Code2 : isImage ? ImageIcon : isFile ? File : FileText;
  const linkedCount = data.linkedArtifactCount ?? 0;
  const sizeLabel = formatByteSize(data.byteSize);

  return (
    <div
      data-memory-id={data.memoryId ?? undefined}
      data-memory-type={data.memoryType ?? undefined}
      className={[
        "group relative min-w-[280px] max-w-[320px] rounded-[28px] border border-border/70 bg-background/95 p-[1px] shadow-[0_18px_42px_-28px_rgba(15,23,42,0.28)] transition-all duration-200",
        selected ? "ring-2 ring-violet-400/70" : "ring-1 ring-border/40",
        dragging ? "scale-[1.015]" : "scale-100",
      ].join(" ")}
      style={{
        boxShadow: selected ? `0 24px 60px -30px ${accent}66, 0 0 0 1px ${accent}22` : undefined,
      }}
    >
      <div className="relative overflow-hidden rounded-[27px] border border-border/40 bg-background/95 px-4 py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at top right, rgba(255,255,255,0.9), transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))",
          }}
        />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: accent }} />
        <div className="pointer-events-none absolute right-4 top-4 h-12 w-12 rounded-full blur-2xl" style={{ backgroundColor: accent, opacity: 0.12 }} />

        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-slate-500/90"
          style={{ right: -7 }}
        />

        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ borderColor: `${accent}55`, color: accent }}
                >
                  <Icon className="h-3 w-3" />
                  <span>
                    {memoryMeta
                      ? memoryMeta.shortLabel
                      : isCode
                      ? "Code context"
                      : isImage
                        ? "Image context"
                        : isFile
                          ? "File context"
                          : "Text context"}
                  </span>
                </span>
                {data.language ? (
                  <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {data.language}
                  </span>
                ) : null}
                {data.fileName ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {isImage ? <FileImage className="h-3 w-3" /> : <File className="h-3 w-3" />}
                    <span>{data.fileName}</span>
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/90">{data.title ?? "Untitled artifact"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {memoryMeta ? memoryMeta.description : "Context node reusable across branches."}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/85 px-2 py-0.5">
                <Move className="h-3 w-3" />
                <span>Draggable</span>
              </span>
              {selected ? (
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-violet-700">
                  Focus
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/25 px-3 py-2">
            {isImage && data.sourceDataUrl ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={data.title ?? data.fileName ?? "Image artifact"}
                  src={data.sourceDataUrl}
                  className="h-28 w-full rounded-xl object-cover"
                />
                <p className="line-clamp-3 text-sm leading-5 text-foreground/88">{previewText(data.preview)}</p>
              </div>
            ) : (
              <p className="line-clamp-4 text-sm leading-5 text-foreground/88">{previewText(data.preview)}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
              <Link2 className="h-3 w-3" />
              <span>{linkedCount} linked target{linkedCount === 1 ? "" : "s"}</span>
            </span>
            {sizeLabel ? (
              <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                {sizeLabel}
              </span>
            ) : null}
            {isCode ? (
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                executable context
              </span>
            ) : memoryMeta ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-700">
                typed memory
              </span>
            ) : isImage ? (
              <span className="rounded-full border border-pink-500/25 bg-pink-500/10 px-2 py-0.5 text-pink-700">
                visual context
              </span>
            ) : isFile ? (
              <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-blue-700">
                uploaded file
              </span>
            ) : (
              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-violet-700">
                narrative context
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ArtifactGraphNode.displayName = "ArtifactGraphNode";
