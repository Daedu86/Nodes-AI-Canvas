"use client";

import React from "react";
import {
  BookCopy,
  BriefcaseBusiness,
  ChevronRight,
  FileQuestion,
  GanttChartSquare,
  Layers3,
} from "lucide-react";
import type { ProjectMemoryItem } from "@/lib/memory-documents";
import type { ProjectDocument } from "@/lib/project-documents";
import type { SessionDocument } from "@/lib/session-documents";
import {
  buildProjectWiki,
  type ProjectWikiFocus,
  type ProjectWikiPageId,
} from "@/lib/project-wiki";

const pageIcon: Record<ProjectWikiPageId, typeof BookCopy> = {
  decisions: GanttChartSquare,
  focus: ChevronRight,
  knowledge: BookCopy,
  "open-questions": FileQuestion,
  overview: BriefcaseBusiness,
  sessions: Layers3,
};

export function ProjectWiki({
  focus,
  memoryItems,
  project,
  sessions,
}: {
  focus: ProjectWikiFocus;
  memoryItems: ProjectMemoryItem[];
  project: ProjectDocument;
  sessions: SessionDocument[];
}) {
  const wiki = React.useMemo(
    () =>
      buildProjectWiki({
        focus,
        memoryItems,
        project,
        sessions,
      }),
    [focus, memoryItems, project, sessions],
  );
  const [selectedPageId, setSelectedPageId] = React.useState<ProjectWikiPageId>("overview");

  React.useEffect(() => {
    setSelectedPageId("overview");
  }, [project.id]);

  const activePage = wiki.pages.find((page) => page.id === selectedPageId) ?? wiki.pages[0];

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border/60 bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border/60 bg-muted/20">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/90 text-sky-700">
              <BookCopy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Project Wiki</p>
              <p className="text-xs text-muted-foreground">
                Canonical knowledge compiled from sessions, typed nodes, and shared context.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
            {sessions.length} sessions
          </span>
          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
            {memoryItems.length} typed nodes
          </span>
          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
            {wiki.pages.length} pages
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {wiki.pages.map((page) => {
            const Icon = pageIcon[page.id];
            const isActive = page.id === activePage.id;
            return (
              <button
                key={page.id}
                type="button"
                className={`mb-2 flex w-full items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "border-sky-500/30 bg-sky-500/8"
                    : "border-border/60 bg-background/70 hover:bg-background"
                }`}
                onClick={() => setSelectedPageId(page.id)}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-sky-700" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{page.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{page.summary}</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <article className="space-y-4">
          <header className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Project knowledge base
            </p>
            <h2 className="text-xl font-semibold text-foreground">{activePage.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{activePage.summary}</p>
          </header>
          <section className="rounded-2xl border border-border/60 bg-background/90 px-4 py-4 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground/90">
              {activePage.body}
            </pre>
          </section>
        </article>
      </div>
    </div>
  );
}
