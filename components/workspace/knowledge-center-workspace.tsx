"use client";

import {
  ArrowLeft,
  BookOpenText,
  Bot,
  Compass,
  FileText,
  GitBranch,
  Network,
  SquareKanban,
} from "lucide-react";
import React from "react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { ProductBrand } from "@/components/workspace/product-brand";
import { Button } from "@/components/ui/button";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(244,114,182,0.08),transparent_24%),linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.78))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.94),rgba(2,6,23,0.82))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))] shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(15,23,42,0.82))] dark:ring-white/[0.03]";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[26px] bg-background/92 p-5 dark:bg-slate-950/80 md:p-6";

const sections = [
  {
    id: "overview",
    title: "What Nodes Is",
    eyebrow: "Overview",
    body:
      "Nodes is an AI workspace for branching, comparison, and synthesis. It is designed to turn messy exploration into structured knowledge and then into a usable output.",
    bullets: [
      "Chat handles open-ended prompting and fast iteration.",
      "Canvas turns conversations into inspectable structure.",
      "Wiki consolidates what the system now knows.",
      "Brief and Nody turn that knowledge into a usable answer.",
    ],
    icon: Compass,
  },
  {
    id: "workflow",
    title: "How The Surfaces Work",
    eyebrow: "Product Model",
    body:
      "The product is intentionally split into layers so work can move from exploration to synthesis without losing structure.",
    bullets: [
      "Chat is free-form input.",
      "Canvas is structured input with branches, links, and artifacts.",
      "Wiki is the canonical memory layer.",
      "Brief is the compact executive readout.",
      "Nody is the query surface over canvas and wiki.",
    ],
    icon: SquareKanban,
  },
  {
    id: "branching",
    title: "Why Branching Matters",
    eyebrow: "Branching",
    body:
      "Branching is not just for retries. It lets you test alternate prompts, rewrite assistant replies, and compare paths without flattening everything into one linear thread.",
    bullets: [
      "Root branches create a new direction from the same starting point.",
      "User branches test alternate user prompts.",
      "Assistant edit branches replace a reply with another possible answer.",
      "Follow-up branches continue from a chosen assistant state.",
    ],
    icon: GitBranch,
  },
  {
    id: "knowledge",
    title: "How Knowledge Builds Up",
    eyebrow: "Knowledge",
    body:
      "The real value of Nodes is not only that it chats. It keeps the structure of the work and turns it into something reusable.",
    bullets: [
      "Artifacts capture reusable units of thought and evidence.",
      "Wiki pages summarize what is stable enough to keep.",
      "Nody can read that structured context and answer against it.",
      "Brief compresses the current state into a final summary.",
    ],
    icon: Network,
  },
  {
    id: "usage",
    title: "Recommended Usage Pattern",
    eyebrow: "Best Practice",
    body:
      "Use Nodes as a loop. Start wide, structure what matters, and then consolidate.",
    bullets: [
      "Start in Chat to explore the problem space.",
      "Move important branches and artifacts into Canvas.",
      "Use Wiki to stabilize decisions, questions, and evidence.",
      "Use Nody to query what the workspace now knows.",
      "Use Brief when you need the current recommendation quickly.",
    ],
    icon: BookOpenText,
  },
] as const;

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={shellClassName}>
      <div className={shellInnerClassName}>{children}</div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-border/60 bg-white/85 p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.38)] dark:bg-slate-950/65 ${className}`}
    >
      {children}
    </section>
  );
}

export function KnowledgeCenterWorkspace() {
  const { showWorkspace } = useWorkspaceSurface();

  return (
    <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
      <WorkspaceShell>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-wrap items-start gap-3">
            <Button type="button" variant="outline" size="sm" onClick={showWorkspace}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Profile
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">Knowledge Center</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                A concise product wiki for how Nodes works, what each surface is for, and how to
                use the workspace as a system instead of a plain chat.
              </p>
            </div>
            <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Product handbook
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
            <Card className="space-y-5">
              <div className="flex items-center gap-3">
                <ProductBrand />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Product Thesis
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">
                    Nodes is built to help you branch, compare, synthesize, and retain knowledge.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Inputs
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">
                    Chat and Canvas are where the user and the system create and structure work.
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Outputs
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">
                    Wiki, Brief, and Nody turn that work into a reusable, queryable, and readable
                    result.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-sky-700" />
                <p className="text-sm font-semibold text-foreground">At a Glance</p>
              </div>
              <div className="space-y-3">
                {[
                  "Chat for exploration",
                  "Canvas for structure",
                  "Wiki for memory",
                  "Brief for the current answer",
                  "Nody for querying the workspace",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[18px] border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground/90"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="space-y-4">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <Card key={section.id} className="scroll-mt-8" >
                    <div id={section.id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/50 text-foreground">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {section.eyebrow}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-foreground">
                          {section.title}
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-foreground/90">
                          {section.body}
                        </p>
                        <div className="mt-4 space-y-2">
                          {section.bullets.map((bullet) => (
                            <div
                              key={bullet}
                              className="rounded-[20px] border border-border/60 bg-background/80 px-3 py-2.5 text-sm text-foreground/90"
                            >
                              {bullet}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-4">
              <Card className="sticky top-0 space-y-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Sections
                </p>
                <div className="space-y-2">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="flex items-center justify-between rounded-[18px] border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground/90 transition hover:bg-muted"
                    >
                      <span>{section.title}</span>
                      <FileText className="size-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </Card>

              <Card className="space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Recommended Flow
                </p>
                <div className="space-y-2 text-sm leading-6 text-foreground/90">
                  <p>1. Explore in Chat.</p>
                  <p>2. Branch and structure in Canvas.</p>
                  <p>3. Consolidate into Wiki.</p>
                  <p>4. Ask Nody for synthesis.</p>
                  <p>5. Use Brief when you need the answer fast.</p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </WorkspaceShell>
    </div>
  );
}
