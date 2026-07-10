"use client";

import { BookCopy, ChevronRight, FileQuestion, GitBranchPlus, Network, Paperclip, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionKnowledge } from "@/components/context/session-knowledge";
import { useSessionUiState } from "@/components/context/session-ui-state";
import type { SessionWikiPageId } from "@/lib/session-wiki";

const pageIcon: Record<SessionWikiPageId, typeof BookCopy> = {
  "open-questions": FileQuestion,
  artifacts: Paperclip,
  branches: GitBranchPlus,
  decisions: Scale,
  focus: ChevronRight,
  overview: Network,
};

type WikiSection = {
  heading: string | null;
  lines: string[];
};

const parseWikiSections = (body: string): WikiSection[] => {
  const lines = body.split(/\r?\n/);
  const sections: WikiSection[] = [];
  let current: WikiSection = { heading: null, lines: [] };

  const pushCurrent = () => {
    if (current.lines.some((line) => line.trim().length > 0)) {
      sections.push({
        heading: current.heading,
        lines: [...current.lines],
      });
    }
  };

  lines.forEach((line) => {
    if (/^##\s+/.test(line.trim())) {
      pushCurrent();
      current = {
        heading: line.replace(/^##\s+/, "").trim(),
        lines: [],
      };
      return;
    }
    current.lines.push(line);
  });

  pushCurrent();
  return sections;
};

const renderWikiBlocks = (lines: string[]) => {
  const blocks: string[][] = [];
  let current: string[] = [];

  lines.forEach((line) => {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    current.push(line);
  });

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks.map((block, index) => {
    const normalized = block.map((line) => line.trim()).filter(Boolean);
    if (normalized.length === 0) return null;

    if (normalized.every((line) => /^-\s+/.test(line))) {
      return (
        <ul key={index} className="space-y-2 text-sm leading-7 text-foreground/90">
          {normalized.map((line) => (
            <li key={line} className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-2">
              {line.replace(/^-\s+/, "")}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
        {normalized.join("\n")}
      </p>
    );
  });
};

export function WikiPanel() {
  const { selectedWikiPageId, setSelectedWikiPageId, wiki } = useSessionKnowledge();
  const { setViewMode } = useSessionUiState();

  const activePage = wiki?.pages.find((page) => page.id === selectedWikiPageId) ?? wiki?.pages[0] ?? null;
  const activeSections = activePage ? parseWikiSections(activePage.body) : [];

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/80 bg-card/72 backdrop-blur">
        <div className="border-b border-border/80 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
              <BookCopy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-semibold tracking-[-0.02em] text-foreground">Wiki</p>
              <p className="text-xs text-muted-foreground">Canonical layer generated from canvas context.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("brief")}>
              Brief
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {wiki?.pages.map((page) => {
            const Icon = pageIcon[page.id];
            const isActive = page.id === activePage?.id;
            return (
              <button
                key={page.id}
                type="button"
                className={`mb-2 flex w-full items-start gap-2 rounded-[12px] border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "border-primary/35 bg-primary/10"
                    : "border-border/80 bg-background/70 hover:bg-muted/60"
                }`}
                onClick={() => setSelectedWikiPageId(page.id)}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {activePage ? (
          <article className="mx-auto flex max-w-4xl flex-col gap-5">
            <header className="rounded-[18px] border border-border/80 bg-card/88 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Session wiki
                  </p>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{activePage.title}</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{activePage.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/80 bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {wiki?.pages.length ?? 0} pages
                  </span>
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                    {activeSections.length > 0 ? `${activeSections.length} sections` : "Narrative page"}
                  </span>
                </div>
              </div>
            </header>
            <section className="grid gap-4">
              {activeSections.length > 0 ? (
                activeSections.map((section, index) => (
                  <div
                    key={`${section.heading ?? "section"}-${index}`}
                    className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {section.heading ?? activePage.title}
                        </p>
                      </div>
                      <div className="space-y-3">{renderWikiBlocks(section.lines)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <section className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground/90">
                    {activePage.body}
                  </pre>
                </section>
              )}
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
