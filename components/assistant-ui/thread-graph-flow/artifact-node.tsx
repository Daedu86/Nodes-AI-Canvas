"use client";

import { memo } from "react";
import { Code2, File, FileImage, FileText, ImageIcon, Link2, Move } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  getArtifactBadgeLabel,
  getArtifactCodeSample,
  getArtifactHeadline,
  getArtifactHighlights,
  getArtifactIntentLabel,
  getArtifactReadableRole,
  getArtifactStatChips,
} from "@/components/assistant-ui/thread-graph-flow/artifact-presentation";
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
  const artifactLike = {
    artifactType,
    byteSize: data.byteSize ?? null,
    content: data.preview,
    fileName: data.fileName ?? null,
    language: data.language ?? null,
    mimeType: data.mimeType ?? null,
    semanticType: data.semanticType ?? null,
    title: data.title ?? "",
  };
  const headline = getArtifactHeadline(artifactLike);
  const highlights = getArtifactHighlights(artifactLike, isCode ? 2 : 3);
  const codeSample = getArtifactCodeSample(artifactLike, 4);
  const statChips = getArtifactStatChips(artifactLike);
  const readableRole = memoryMeta?.label ?? getArtifactReadableRole(artifactType);
  const intentLabel = memoryMeta?.description ?? getArtifactIntentLabel(artifactType);

  return (
    <div
      data-memory-id={data.memoryId ?? undefined}
      data-memory-type={data.memoryType ?? undefined}
      className={[
        "group relative min-w-[300px] max-w-[340px] rounded-[28px] border border-white/10 bg-slate-950/95 p-[1px] shadow-[0_18px_42px_-28px_rgba(15,23,42,0.4)] transition-all duration-200",
        selected ? "ring-2 ring-violet-400/70" : "ring-1 ring-white/10",
        dragging ? "scale-[1.015]" : "scale-100",
      ].join(" ")}
      style={{
        boxShadow: selected ? `0 24px 60px -30px ${accent}66, 0 0 0 1px ${accent}22` : undefined,
      }}
    >
      <div className="relative overflow-hidden rounded-[27px] border border-white/8 bg-slate-950/95 px-4 py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at top right, rgba(148,163,184,0.12), transparent 36%), linear-gradient(180deg, rgba(20,23,31,0.98), rgba(15,17,24,0.98))",
          }}
        />
        <div className="pointer-events-none absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: accent }} />
        <div className="pointer-events-none absolute right-4 top-4 h-12 w-12 rounded-full blur-2xl" style={{ backgroundColor: accent, opacity: 0.12 }} />

        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-slate-950 !bg-slate-300/90"
          style={{ right: -7 }}
        />

        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{
                    backgroundColor: `${accent}14`,
                    borderColor: `${accent}33`,
                    color: accent,
                  }}
                >
                  <Icon className="h-3 w-3" />
                  <span>
                    {memoryMeta
                      ? memoryMeta.shortLabel
                      : getArtifactBadgeLabel(artifactLike)}
                  </span>
                </span>
                {data.language ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-300">
                    {data.language}
                  </span>
                ) : null}
                {data.fileName ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    {isImage ? <FileImage className="h-3 w-3" /> : <File className="h-3 w-3" />}
                    <span>{data.fileName}</span>
                  </span>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-100">{data.title ?? "Untitled artifact"}</p>
                <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: accent }}>
                  {readableRole}
                </p>
                <p className="text-xs text-slate-300/78">{intentLabel}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                <Move className="h-3 w-3" />
                <span>Draggable</span>
              </span>
              {selected ? (
                <span className="rounded-full border border-violet-400/25 bg-violet-400/12 px-2 py-0.5 text-violet-200">
                  Focus
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
            {isImage && data.sourceDataUrl ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={data.title ?? data.fileName ?? "Image artifact"}
                  src={data.sourceDataUrl}
                  className="h-28 w-full rounded-xl object-cover"
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-5 text-slate-100">{headline}</p>
                  {highlights.length > 0 ? (
                    <div className="space-y-1">
                      {highlights.slice(0, 2).map((line) => (
                        <p key={line} className="line-clamp-2 text-xs leading-5 text-slate-300/78">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="line-clamp-3 text-sm leading-5 text-slate-100/88">{previewText(data.preview)}</p>
                  )}
                </div>
              </div>
            ) : isCode ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Code sample</span>
                  {data.language ? <span>{data.language}</span> : null}
                </div>
                <div className="overflow-hidden rounded-xl border border-emerald-500/18 bg-black/40 px-3 py-2 text-[12px] text-emerald-100">
                  {codeSample.length > 0 ? (
                    codeSample.map((line, index) => (
                      <div key={`${index}:${line}`} className="grid grid-cols-[auto,1fr] gap-3 leading-5">
                        <span className="select-none text-emerald-300/45">{index + 1}</span>
                        <code className="truncate font-mono">{line}</code>
                      </div>
                    ))
                  ) : (
                    <p className="font-mono text-emerald-100/80">{previewText(data.preview)}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium leading-5 text-slate-100">{headline}</p>
                {highlights.length > 0 ? (
                  <div className="space-y-1">
                    {highlights.map((line) => (
                      <div key={line} className="flex items-start gap-2 text-xs leading-5 text-slate-200/84">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                        <span className="line-clamp-2">{line}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="line-clamp-4 text-sm leading-5 text-slate-100/88">{previewText(data.preview)}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300/80">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
              <Link2 className="h-3 w-3" />
              <span>{linkedCount} linked target{linkedCount === 1 ? "" : "s"}</span>
            </span>
            {sizeLabel ? (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                {sizeLabel}
              </span>
            ) : null}
            {statChips.slice(0, 2).map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                {chip}
              </span>
            ))}
            {isCode ? (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/12 px-2 py-0.5 text-emerald-200">
                executable context
              </span>
            ) : memoryMeta ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/12 px-2 py-0.5 text-amber-200">
                typed memory
              </span>
            ) : isImage ? (
              <span className="rounded-full border border-pink-400/25 bg-pink-400/12 px-2 py-0.5 text-pink-200">
                visual context
              </span>
            ) : isFile ? (
              <span className="rounded-full border border-blue-400/25 bg-blue-400/12 px-2 py-0.5 text-blue-200">
                uploaded file
              </span>
            ) : (
              <span className="rounded-full border border-violet-400/25 bg-violet-400/12 px-2 py-0.5 text-violet-200">
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
