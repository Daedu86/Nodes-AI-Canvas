"use client";

import { BookCopy, ChevronRight, FileQuestion, GitBranchPlus, Network, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNodyPanel } from "@/components/context/nody-panel";
import { useSessionUiState } from "@/components/context/session-ui-state";
import type { SessionWikiPageId } from "@/lib/session-wiki";

const pageIcon: Record<SessionWikiPageId, typeof BookCopy> = {
  "open-questions": FileQuestion,
  artifacts: Paperclip,
  branches: GitBranchPlus,
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
            <li key={line} className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
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
  const { selectedWikiPageId, setSelectedWikiPageId, wiki } = useNodyPanel();
  const { setViewMode } = useSessionUiState();

  const activePage = wiki?.pages.find((page) => page.id === selectedWikiPageId) ?? wiki?.pages[0] ?? null;
  const activeSections = activePage ? parseWikiSections(activePage.body) : [];

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.94))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.1),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.86),rgba(2,6,23,0.88))]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-black/[0.04] bg-white/55 backdrop-blur dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="border-b border-black/[0.04] px-5 py-5 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-500/20 bg-white/80 text-sky-700 shadow-sm dark:bg-sky-400/10 dark:text-sky-200">
              <BookCopy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-semibold tracking-[-0.02em] text-foreground">Wiki</p>
              <p className="text-xs text-muted-foreground">Canonical layer between canvas and Nody.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("brief")}>
              Brief
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("nody")}>
              Nody
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
                className={`mb-2 flex w-full items-start gap-2 rounded-[22px] border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? "border-sky-500/30 bg-sky-500/10 shadow-sm"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {activePage ? (
          <article className="mx-auto flex max-w-4xl flex-col gap-5">
            <header className="rounded-[32px] border border-white/70 bg-white/78 px-6 py-5 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.38)] backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Session wiki
                  </p>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{activePage.title}</h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{activePage.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {wiki?.pages.length ?? 0} pages
                  </span>
                  <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-700">
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
                    className="rounded-[30px] border border-white/70 bg-white/75 px-5 py-5 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.38)] backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
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
                <section className="rounded-[30px] border border-white/70 bg-white/75 px-5 py-5 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.38)] backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
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
