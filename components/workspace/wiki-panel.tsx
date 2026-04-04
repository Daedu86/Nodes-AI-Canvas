"use client";

import { BookCopy, ChevronRight, FileQuestion, GitBranchPlus, Network, Paperclip } from "lucide-react";
import { useNodyPanel } from "@/components/context/nody-panel";
import type { SessionWikiPageId } from "@/lib/session-wiki";

const pageIcon: Record<SessionWikiPageId, typeof BookCopy> = {
  "open-questions": FileQuestion,
  artifacts: Paperclip,
  branches: GitBranchPlus,
  focus: ChevronRight,
  overview: Network,
};

export function WikiPanel() {
  const { selectedWikiPageId, setSelectedWikiPageId, wiki } = useNodyPanel();

  const activePage = wiki?.pages.find((page) => page.id === selectedWikiPageId) ?? wiki?.pages[0] ?? null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border/60 bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-muted/20">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/90 text-sky-700">
              <BookCopy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Wiki</p>
              <p className="text-xs text-muted-foreground">Canonical layer between canvas and Nody.</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {wiki?.pages.map((page) => {
            const Icon = pageIcon[page.id];
            const isActive = page.id === activePage?.id;
            return (
              <button
                key={page.id}
                type="button"
                className={`mb-2 flex w-full items-start gap-2 rounded-xl border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "border-sky-500/30 bg-sky-500/8"
                    : "border-border/60 bg-background/70 hover:bg-background"
                }`}
                onClick={() => setSelectedWikiPageId(page.id)}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-sky-700" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{page.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{page.summary}</p>
                </div>
              </button>
            );
          }) ?? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              Open the canvas to let the wiki compile its first pages.
            </div>
          )}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {activePage ? (
          <article className="space-y-4">
            <header className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Session wiki
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
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No wiki pages yet.
          </div>
        )}
      </div>
    </div>
  );
}
