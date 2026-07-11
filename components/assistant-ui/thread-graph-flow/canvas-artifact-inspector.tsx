"use client";

import {
  FileImage,
  FilePlus2,
  Sparkles,
  Trash2,
  Unlink2,
} from "lucide-react";
import React from "react";
import {
  artifactAccent,
  artifactContentLabel,
  artifactContentPlaceholder,
  artifactTypeLabel,
  getSemanticArtifactMeta,
  semanticArtifactPresets,
} from "@/components/assistant-ui/thread-graph-flow/canvas-workspace-utils";
import type {
  SessionArtifact,
  SessionArtifactSemanticType,
} from "@/lib/session-artifacts";
import { formatBytes } from "@/lib/context-budget";

type AttachableTarget = {
  id: string;
  preview: string;
  role: string;
};

type ArtifactUpdate = {
  content?: string;
  language?: string | null;
  semanticType?: SessionArtifactSemanticType | null;
  title?: string;
};

type CanvasArtifactInspectorProps = {
  artifact: SessionArtifact;
  artifactLineCount: number;
  artifactPreviewSize: string | null;
  artifactSize: string | null;
  artifactStatChips: string[];
  attachableTargets: AttachableTarget[];
  contextBudgetMaxImagePreviewBytes: number;
  hasOutputLink: boolean;
  isLinkedToTarget: (targetId: string) => boolean;
  linkedTargetCount: number;
  onConnectTo: (value: string) => void;
  onDelete: () => void;
  onDisconnectOutput: () => void;
  onOpenTarget: (targetId: string) => void;
  onRestoreRevision: (revisionId: string) => void;
  onToggleLink: (targetId: string) => void;
  onToggleSync: () => void;
  onUpdate: (patch: ArtifactUpdate) => void;
};

export function CanvasArtifactInspector({
  artifact,
  artifactLineCount,
  artifactPreviewSize,
  artifactSize,
  artifactStatChips,
  attachableTargets,
  contextBudgetMaxImagePreviewBytes,
  hasOutputLink,
  isLinkedToTarget,
  linkedTargetCount,
  onConnectTo,
  onDelete,
  onDisconnectOutput,
  onOpenTarget,
  onRestoreRevision,
  onToggleLink,
  onToggleSync,
  onUpdate,
}: CanvasArtifactInspectorProps) {
  const semanticMeta =
    artifact.artifactType === "text"
      ? getSemanticArtifactMeta(artifact.semanticType ?? null)
      : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">Synchronization</p>
            <p className="text-[11px] text-muted-foreground">
              Auto updates only after run completion.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs"
            onClick={onToggleSync}
          >
            {artifact.syncMode === "paused" ? "Resume auto" : "Pause auto"}
          </button>
        </div>
        <label className="grid gap-1 text-xs text-foreground">
          <span>Connect to…</span>
          <select
            aria-label="Connect selected artifact to"
            defaultValue=""
            className="h-9 rounded-md border border-border/60 bg-background px-2 text-xs"
            onChange={(event) => {
              onConnectTo(event.target.value);
              event.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              Select a prompt or response
            </option>
            {attachableTargets
              .filter((target) => target.role !== "root")
              .map((target) => (
                <option
                  key={target.id}
                  value={`${target.role === "assistant" ? "response" : "prompt"}:${target.id}`}
                >
                  {target.role === "assistant" ? "Output from" : "Input to"} ·{" "}
                  {target.preview.slice(0, 56) || target.id}
                </option>
              ))}
          </select>
        </label>
        {artifact.revisions && artifact.revisions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Revision history</p>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {[...artifact.revisions].reverse().map((revision) => (
                <button
                  key={revision.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                  onClick={() => onRestoreRevision(revision.id)}
                >
                  <span className="truncate">
                    {revision.content.replace(/\s+/g, " ").slice(0, 58) || "Empty"}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {revision.origin}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                borderColor: `${artifactAccent(artifact)}55`,
                color: artifactAccent(artifact),
              }}
            >
              {artifactTypeLabel(artifact)}
            </span>
            <span className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {linkedTargetCount} linked target{linkedTargetCount === 1 ? "" : "s"}
            </span>
            {artifactSize ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {artifactSize}
              </span>
            ) : null}
            {artifactPreviewSize ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                preview {artifactPreviewSize}
              </span>
            ) : null}
            {artifactStatChips.slice(0, 2).map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {chip}
              </span>
            ))}
            {artifact.artifactType === "code" && artifactLineCount > 0 ? (
              <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {artifactLineCount} lines
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasOutputLink ? (
            <button
              type="button"
              className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
              onClick={onDisconnectOutput}
            >
              Disconnect output
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-500/15"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
          <Sparkles className="h-4 w-4 text-violet-600" />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1.4fr,0.8fr]">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Title</span>
          <input
            type="text"
            aria-label="Artifact title"
            value={artifact.title}
            onChange={(event) => onUpdate({ title: event.target.value })}
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
          />
        </label>
        {artifact.artifactType === "text" ? (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Semantic type</span>
            <select
              aria-label="Artifact semantic type"
              value={artifact.semanticType ?? "draft"}
              onChange={(event) =>
                onUpdate({
                  semanticType: event.target.value as SessionArtifactSemanticType,
                })
              }
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
            >
              {semanticArtifactPresets.map(({ semanticType }) => (
                <option key={semanticType} value={semanticType}>
                  {getSemanticArtifactMeta(semanticType)?.label ?? semanticType}
                </option>
              ))}
            </select>
          </label>
        ) : artifact.artifactType === "code" ? (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Language</span>
            <input
              type="text"
              aria-label="Artifact language"
              value={artifact.language ?? ""}
              onChange={(event) => onUpdate({ language: event.target.value })}
              placeholder="ts"
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
            />
          </label>
        ) : (
          <div className="space-y-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80">Artifact metadata</p>
            <div className="space-y-1">
              {artifact.fileName ? <p>File: {artifact.fileName}</p> : null}
              {artifact.mimeType ? <p>MIME: {artifact.mimeType}</p> : null}
              {artifactSize ? <p>Size: {artifactSize}</p> : null}
              {artifactPreviewSize ? (
                <p>
                  Preview: {artifactPreviewSize} / budget{" "}
                  {formatBytes(contextBudgetMaxImagePreviewBytes)}
                </p>
              ) : null}
              {artifact.blobRef ? <p>Original stored in blob store</p> : null}
              {!artifact.fileName &&
              !artifact.mimeType &&
              !artifactSize &&
              !artifactPreviewSize &&
              !artifact.blobRef ? (
                <p>No upload metadata stored for this artifact.</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {artifact.artifactType === "image" && artifact.sourceDataUrl ? (
        <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
            <FileImage className="h-4 w-4 text-pink-600" />
            <span>Image preview</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={artifact.title}
            src={artifact.sourceDataUrl}
            className="max-h-48 w-full rounded-xl border border-border/50 bg-muted/20 object-contain"
          />
        </div>
      ) : null}

      <label className="space-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">
          {artifactContentLabel(artifact)}
        </span>
        <textarea
          aria-label={
            artifact.artifactType === "text"
              ? "Artifact content"
              : artifact.artifactType === "image"
                ? "Artifact notes"
                : artifact.artifactType === "file"
                  ? "Artifact extracted text"
                  : "Artifact content"
          }
          rows={6}
          value={artifact.content}
          onChange={(event) => onUpdate({ content: event.target.value })}
          placeholder={artifactContentPlaceholder(artifact)}
          className="min-h-[136px] w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500/35"
        />
      </label>

      <div className="space-y-2 rounded-2xl border border-border/60 bg-background/90 px-3 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground/80">Links</p>
          {semanticMeta ? (
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {semanticMeta.label}
            </span>
          ) : null}
        </div>
        {attachableTargets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No available targets.</p>
        ) : (
          <div className="max-h-[148px] space-y-2 overflow-y-auto pr-1">
            {attachableTargets.map((target) => {
              const isLinked = isLinkedToTarget(target.id);
              return (
                <div
                  key={target.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    isLinked
                      ? "border-violet-500/30 bg-violet-500/10"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {target.role}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground/85">
                        {target.preview}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`${isLinked ? "Detach" : "Attach"} target ${target.id}`}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${
                        isLinked
                          ? "border-violet-500/35 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15"
                          : "border-border/60 bg-background hover:bg-muted"
                      }`}
                      onClick={() => onToggleLink(target.id)}
                    >
                      {isLinked ? (
                        <Unlink2 className="h-3.5 w-3.5" />
                      ) : (
                        <FilePlus2 className="h-3.5 w-3.5" />
                      )}
                      <span>{isLinked ? "Detach" : "Attach"}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Open target ${target.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                      onClick={() => onOpenTarget(target.id)}
                    >
                      <span>Open</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
