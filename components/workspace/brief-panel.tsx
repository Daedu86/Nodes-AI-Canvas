"use client";

import { BookCopy, FileText, Lightbulb, Telescope, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNodyPanel } from "@/components/context/nody-panel";
import { useSessionUiState } from "@/components/context/session-ui-state";
import type { NodySourceCatalogEntry } from "@/lib/nody-insight";
import type { SessionWikiPageId } from "@/lib/session-wiki";

export function BriefPanel() {
  const { brief, setSelectedWikiPageId } = useNodyPanel();
  const { setCanvasSelectionId, setViewMode } = useSessionUiState();

  const handleOpenSource = (source: NodySourceCatalogEntry) => {
    if (source.kind === "wiki") {
      setSelectedWikiPageId(source.targetId as SessionWikiPageId);
      setViewMode("wiki");
      return;
    }
    setCanvasSelectionId(String(source.targetId));
    setViewMode("canvas");
  };

  if (!brief) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 py-6">
        <div className="max-w-xl rounded-[18px] border border-border/80 bg-card/88 px-6 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="text-sm text-muted-foreground">
            Ask Nody a concrete question and the workspace will compile a brief here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <article className="mx-auto flex max-w-5xl flex-col gap-5">
            <header className="rounded-[18px] border border-border/80 bg-card/88 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Session brief
                    </p>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                      {brief.title}
                    </h2>
                  </div>
                </div>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{brief.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("wiki")}>
                  <BookCopy className="mr-1.5 h-3.5 w-3.5" />
                  Wiki
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("canvas")}>
                  <Waypoints className="mr-1.5 h-3.5 w-3.5" />
                  Canvas
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("nody")}>
                  <Telescope className="mr-1.5 h-3.5 w-3.5" />
                  Ask Nody
                </Button>
              </div>
            </div>
            {brief.signals.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {brief.signals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_320px]">
            <div className="space-y-5">
              <div className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Current recommendation
                  </p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {brief.recommendation}
                </p>
              </div>

              <div className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Evidence anchors
                </p>
                {brief.evidence.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {brief.evidence.map((source) => (
                      <button
                        key={source.ref}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded-[12px] border border-border/80 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
                        onClick={() => handleOpenSource(source)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-foreground/90">{source.label}</span>
                            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground dark:bg-white/10">
                              {source.kind}
                            </span>
                          </div>
                          {source.preview ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                              {source.preview}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                          Open
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ask Nody a focused question to attach explicit evidence anchors here.
                  </p>
                )}
              </div>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Brief route
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("wiki")}>
                    <BookCopy className="mr-1.5 h-3.5 w-3.5" />
                    Open wiki
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setViewMode("canvas")}>
                    <Waypoints className="mr-1.5 h-3.5 w-3.5" />
                    Inspect canvas
                  </Button>
                </div>
              </div>

              <div className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Next move
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground/90">
                  {brief.next ?? "No immediate action is required yet."}
                </p>
              </div>

              <div className="rounded-[18px] border border-border/80 bg-card/88 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Open questions
                </p>
                {brief.openQuestions.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {brief.openQuestions.map((question) => (
                      <div key={question} className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-2 text-sm text-foreground/90">
                        {question}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No explicit open questions are currently pinned in the wiki.
                  </p>
                )}
              </div>
            </aside>
          </section>
        </article>
      </div>
    </div>
  );
}
