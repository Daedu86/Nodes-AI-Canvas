"use client";

import React from "react";
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  ListChecks,
  MessageSquareText,
  Search,
  Scale,
  Table2,
  TextCursorInput,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  SessionArtifactSemanticType,
  SessionArtifactType,
} from "@/lib/session-artifacts";

export const CANVAS_BLOCK_DRAG_MIME = "application/x-nodes-canvas-block";

export type CanvasBlockDefinition = {
  id: string;
  category: "process" | "inputs" | "outputs";
  title: string;
  description: string;
  artifactType?: SessionArtifactType;
  semanticType?: SessionArtifactSemanticType | null;
  action: "prompt" | "artifact" | "upload-file" | "upload-image";
  accent: string;
  icon: LucideIcon;
};

export const INITIAL_CANVAS_BLOCKS: CanvasBlockDefinition[] = [
  {
    id: "process-prompt",
    category: "process",
    title: "Prompt",
    description: "Run a model instruction with connected inputs and outputs.",
    action: "prompt",
    accent: "#0f766e",
    icon: MessageSquareText,
  },
  {
    id: "input-text",
    category: "inputs",
    title: "Text",
    description: "Reusable narrative context.",
    action: "artifact",
    artifactType: "text",
    semanticType: null,
    accent: "#64748b",
    icon: TextCursorInput,
  },
  {
    id: "input-file",
    category: "inputs",
    title: "File",
    description: "Upload a source file and extracted text.",
    action: "upload-file",
    artifactType: "file",
    semanticType: null,
    accent: "#2563eb",
    icon: Upload,
  },
  {
    id: "input-image",
    category: "inputs",
    title: "Image",
    description: "Visual context with an optional note.",
    action: "upload-image",
    artifactType: "image",
    semanticType: null,
    accent: "#db2777",
    icon: ImageIcon,
  },
  {
    id: "input-code",
    category: "inputs",
    title: "Code",
    description: "Exact syntax, config, or implementation context.",
    action: "artifact",
    artifactType: "code",
    semanticType: null,
    accent: "#059669",
    icon: Braces,
  },
  {
    id: "output-decision",
    category: "outputs",
    title: "Decision",
    description: "Recommendation, rationale, risks, and alternatives.",
    action: "artifact",
    artifactType: "text",
    semanticType: "decision",
    accent: "#7c3aed",
    icon: Scale,
  },
  {
    id: "output-evidence",
    category: "outputs",
    title: "Evidence",
    description: "Claims, observations, sources, and relevance.",
    action: "artifact",
    artifactType: "text",
    semanticType: "evidence",
    accent: "#2563eb",
    icon: FileText,
  },
  {
    id: "output-plan",
    category: "outputs",
    title: "Plan",
    description: "Ordered steps, dependencies, and verification.",
    action: "artifact",
    artifactType: "text",
    semanticType: "plan",
    accent: "#ea580c",
    icon: ListChecks,
  },
  {
    id: "output-table",
    category: "outputs",
    title: "Table",
    description: "Deterministic rows and columns with text fallback.",
    action: "artifact",
    artifactType: "text",
    semanticType: "table",
    accent: "#0891b2",
    icon: Table2,
  },
];

const categoryLabels: Record<CanvasBlockDefinition["category"], string> = {
  process: "Process",
  inputs: "Inputs",
  outputs: "Outputs",
};

export function getCanvasBlockDefinition(id: string) {
  return INITIAL_CANVAS_BLOCKS.find((block) => block.id === id) ?? null;
}

export function CanvasBlockLibrary({
  collapsed,
  onAddBlock,
  onCollapsedChange,
}: {
  collapsed: boolean;
  onAddBlock: (block: CanvasBlockDefinition) => void;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      INITIAL_CANVAS_BLOCKS.filter((block) => {
        if (!normalizedQuery) return true;
        return `${block.title} ${block.description} ${categoryLabels[block.category]}`
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery],
  );

  return (
    <aside
      aria-label="Block library"
      data-testid="canvas-block-library"
      className={[
        "relative z-30 flex h-full shrink-0 flex-col border-r border-border/60 bg-transparent transition-[width] duration-200",
        collapsed ? "w-14" : "w-72",
      ].join(" ")}
    >
      <div className="flex h-14 items-center justify-between border-b border-border/60 px-2">
        {collapsed ? null : (
          <div className="min-w-0 px-2">
            <p className="truncate text-sm font-semibold text-foreground">Blocks</p>
            <p className="truncate text-[11px] text-muted-foreground">Drag or click to add</p>
          </div>
        )}
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expand block library" : "Collapse block library"}
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
          {INITIAL_CANVAS_BLOCKS.map((block) => {
            const Icon = block.icon;
            return (
              <button
                key={block.id}
                type="button"
                draggable
                title={`${categoryLabels[block.category]}: ${block.title}`}
                aria-label={`Add ${block.title} block`}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onAddBlock(block)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(CANVAS_BLOCK_DRAG_MIME, block.id);
                  event.dataTransfer.setData("text/plain", block.id);
                }}
              >
                <Icon className="h-4 w-4" style={{ color: block.accent }} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search blocks</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search blocks"
              className="h-10 w-full rounded-xl border border-border/60 bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>

          <div className="mt-4 space-y-5">
            {(Object.keys(categoryLabels) as CanvasBlockDefinition["category"][]).map((category) => {
              const blocks = filtered.filter((block) => block.category === category);
              if (blocks.length === 0) return null;
              return (
                <section key={category} aria-labelledby={`canvas-block-category-${category}`}>
                  <h2
                    id={`canvas-block-category-${category}`}
                    className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {categoryLabels[category]}
                  </h2>
                  <div className="grid grid-cols-1 gap-2">
                    {blocks.map((block) => {
                      const Icon = block.icon;
                      return (
                        <button
                          key={block.id}
                          type="button"
                          draggable
                          aria-label={`Add ${block.title} block`}
                          className="group min-h-28 rounded-xl border border-border/70 bg-background p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onAddBlock(block)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(CANVAS_BLOCK_DRAG_MIME, block.id);
                            event.dataTransfer.setData("text/plain", block.id);
                          }}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border"
                              style={{
                                color: block.accent,
                                borderColor: `${block.accent}40`,
                                backgroundColor: `${block.accent}10`,
                              }}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span
                              className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground"
                              style={{ borderColor: `${block.accent}70` }}
                            >
                              {category === "process" ? "run" : category === "inputs" ? "in" : "out"}
                            </span>
                          </span>
                          <span className="mt-3 block text-sm font-medium text-foreground">{block.title}</span>
                          <span className="mt-1 line-clamp-3 block text-[11px] leading-4 text-muted-foreground">
                            {block.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No blocks match “{query}”.
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
