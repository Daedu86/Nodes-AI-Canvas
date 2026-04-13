"use client";

import {
  ArrowLeft,
  Compass,
  GitBranch,
  KeyRound,
  Keyboard,
  Layers3,
  ListChecks,
  MessageSquareText,
  Network,
  Sparkles,
  SquareKanban,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { ProductBrand } from "@/components/workspace/product-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-hidden rounded-[18px] bg-background/92";

type DocSection = {
  id: string;
  title: string;
  body: string;
  bullets?: string[];
};

type DocPage = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: DocSection[];
};

const pages: DocPage[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "The fastest path from first login to a usable output.",
    icon: Compass,
    sections: [
      {
        id: "what-is-nodes",
        title: "What Nodes Is",
        body:
          "Nodes is a decision workspace. You explore in chat, structure in canvas, stabilize in wiki, and then produce a brief. The core idea is that exploration should remain inspectable and reusable, not flattened into a single transcript.",
        bullets: [
          "Chat for fast exploration.",
          "Canvas for branching structure and reusable artifacts.",
          "Wiki as canonical knowledge.",
          "Brief as the current answer snapshot.",
          "Nody as query and synthesis over the workspace.",
        ],
      },
      {
        id: "recommended-loop",
        title: "Recommended Loop",
        body:
          "If you use Nodes as a loop, it stays simple: explore, structure, consolidate, then decide.",
        bullets: [
          "1. Ask in Chat.",
          "2. Branch and pin artifacts in Canvas.",
          "3. Consolidate stable facts into Wiki.",
          "4. Use Nody to synthesize and cite sources.",
          "5. Use Brief for the final summary.",
        ],
      },
    ],
  },
  {
    id: "surfaces",
    title: "Surfaces",
    description: "What each surface is for and how they fit together.",
    icon: SquareKanban,
    sections: [
      {
        id: "chat",
        title: "Chat",
        body:
          "Chat is the fastest place to explore. It is intentionally not the final output. Use it to probe options, write prompts, and iterate quickly.",
      },
      {
        id: "canvas",
        title: "Canvas",
        body:
          "Canvas is structured work: nodes, branches, links, and artifacts. It is where you keep parallel approaches visible so you can compare them later.",
      },
      {
        id: "wiki",
        title: "Wiki",
        body:
          "Wiki is the memory layer. It holds the stable facts, decisions, and open questions you want to carry forward.",
      },
      {
        id: "brief",
        title: "Brief",
        body:
          "Brief is the canonical output snapshot: recommendation, evidence, risks, and next steps. It should be the thing you can share or paste into a doc.",
      },
      {
        id: "nody",
        title: "Nody",
        body:
          "Nody is a query surface over your workspace. It reads canvas and wiki, then produces synthesis with links back to sources.",
      },
    ],
  },
  {
    id: "branching",
    title: "Branching",
    description: "How branching works and when to use each option.",
    icon: GitBranch,
    sections: [
      {
        id: "why-branch",
        title: "Why Branch",
        body:
          "Branching is not just retry. It lets you explore alternatives without destroying the original path.",
        bullets: [
          "Root branch: start a new direction from the same entry.",
          "User branch: try an alternate user prompt at the same point.",
          "Edit branch: rewrite an assistant reply as an alternative.",
          "Follow-up: continue from a chosen assistant state.",
        ],
      },
      {
        id: "how-to-compare",
        title: "How To Compare",
        body:
          "Use the canvas to keep sibling branches visible. Promote stable conclusions to wiki and keep evidence as artifacts so you can audit why a branch won.",
      },
    ],
  },
  {
    id: "artifacts",
    title: "Artifacts",
    description: "Reusable units of thought you pin to the canvas.",
    icon: Layers3,
    sections: [
      {
        id: "what-are-artifacts",
        title: "What Artifacts Are",
        body:
          "Artifacts are reusable units. They turn messy exploration into structured material you can cite, reuse, and promote into the wiki.",
      },
      {
        id: "semantic-types",
        title: "Semantic Types",
        body:
          "Use semantic artifacts whenever possible so the system can understand intent, not just format.",
        bullets: ["Decision", "Evidence", "Plan", "Question", "Draft"],
      },
      {
        id: "promotion",
        title: "Promotion To Wiki",
        body:
          "When something is stable enough, promote it. The wiki should contain what you want to keep, not everything you tried.",
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    description: "How sessions and knowledge roll up into projects.",
    icon: Network,
    sections: [
      {
        id: "sessions-vs-projects",
        title: "Sessions vs Projects",
        body:
          "Sessions are the working units. Projects group sessions and consolidate the wiki and brief into longer-lived context.",
      },
      {
        id: "memory",
        title: "Memory",
        body:
          "Memory items are the small reusable facts you want to apply across sessions and projects. Keep them short and source-backed.",
      },
    ],
  },
  {
    id: "models",
    title: "Models & Providers",
    description: "How model selection works and what is stored per user.",
    icon: Sparkles,
    sections: [
      {
        id: "provider-setup",
        title: "Providers",
        body:
          "Nodes supports multiple providers. Your provider configuration is saved per user and applied server-side so API keys are not exposed to the browser.",
        bullets: ["OpenRouter (free models supported)", "Ollama (local)", "OpenAI, Anthropic, Gemini (optional)"],
      },
      {
        id: "fallbacks",
        title: "Free Model Fallbacks",
        body:
          "Free models can be rate-limited. Nodes will fall back when a selected free model is unavailable, and will show more specific errors when it cannot.",
      },
    ],
  },
  {
    id: "auth",
    title: "Authentication",
    description: "Sign-in methods and user scoping.",
    icon: KeyRound,
    sections: [
      {
        id: "sso",
        title: "OAuth (SSO)",
        body:
          "GitHub and Google are OAuth providers. Users do not configure anything; the app owner configures the OAuth credentials once in production.",
      },
      {
        id: "magic-link",
        title: "Email Magic Link",
        body:
          "Email login is passwordless. The app sends a one-time sign-in link via SMTP. It requires an email provider configuration on the server.",
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Shortcuts & Tips",
    description: "Little habits that make Nodes feel fast.",
    icon: Keyboard,
    sections: [
      {
        id: "split-panes",
        title: "Split Panes",
        body:
          "Split mode is adjustable. Close panes you do not need and keep the canvas large when comparing branches.",
      },
      {
        id: "branching-controls",
        title: "Branching Controls",
        body:
          "Use the unified Branch panel in chat to create edit branches and follow-ups without duplicating controls.",
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Common questions and quick answers.",
    icon: ListChecks,
    sections: [
      {
        id: "why-wiki",
        title: "Why a Wiki?",
        body:
          "Because chat is not memory. The wiki is the stable layer that remains useful after exploration ends.",
      },
      {
        id: "why-brief",
        title: "Why a Brief?",
        body:
          "Because you need a canonical output. Brief is the product’s landing format for decisions and next steps.",
      },
      {
        id: "why-nody",
        title: "Why Nody?",
        body:
          "Because synthesis without grounding is brittle. Nody is the query layer that should link back to the sources.",
      },
    ],
  },
];

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
      className={`rounded-[18px] border border-border/80 bg-card/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

export function KnowledgeCenterWorkspace() {
  const { showWorkspace } = useWorkspaceSurface();
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? "getting-started");
  const [query, setQuery] = useState("");

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? pages[0]!,
    [activePageId],
  );

  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return pages;

    return pages.filter((page) => {
      if (page.title.toLowerCase().includes(normalized)) return true;
      if (page.description.toLowerCase().includes(normalized)) return true;
      return page.sections.some(
        (section) =>
          section.title.toLowerCase().includes(normalized) ||
          section.body.toLowerCase().includes(normalized) ||
          (section.bullets ?? []).some((bullet) => bullet.toLowerCase().includes(normalized)),
      );
    });
  }, [query]);

  const activeSections = activePage.sections;

  return (
    <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
      <WorkspaceShell>
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-border/80 bg-card/40 px-5 py-4">
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
                  Product wiki for how Nodes works, what each surface is for, and how to use the
                  workspace as a system.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-muted/55 px-3 py-1.5 text-[11px] font-medium text-muted-foreground md:flex">
                <MessageSquareText className="size-4" />
                Handbook
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
            <aside className="min-h-0 border-b border-border/80 bg-card/20 p-4 md:border-b-0 md:border-r md:p-5">
              <div className="flex items-center gap-3">
                <ProductBrand />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Knowledge Center
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Search, then pick a page.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search docs"
                  aria-label="Search knowledge center"
                />
                <nav className="max-h-[calc(100vh-320px)] space-y-2 overflow-auto pr-1">
                  {filteredPages.map((page) => {
                    const Icon = page.icon;
                    const isActive = page.id === activePage.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setActivePageId(page.id)}
                        className={`w-full rounded-[14px] border px-3 py-2 text-left transition ${
                          isActive
                            ? "border-border/90 bg-background/85 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                            : "border-border/70 bg-card/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[12px] border ${
                              isActive
                                ? "border-border/80 bg-muted/60 text-foreground"
                                : "border-border/60 bg-card/60 text-muted-foreground"
                            }`}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{page.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {page.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            <main className="min-h-0 overflow-auto p-4 md:p-6">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                <Card className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Page
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold text-foreground">
                        {activePage.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {activePage.description}
                      </p>
                    </div>
                    <div className="hidden rounded-[14px] border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground md:block">
                      Tip: open Split and keep this on the side.
                    </div>
                  </div>
                </Card>

                {activeSections.map((section) => (
                  <Card key={section.id} className="scroll-mt-24">
                    <div id={sectionAnchor(activePage.id, section.id)} className="space-y-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Section
                      </p>
                      <h3 className="text-xl font-semibold text-foreground">{section.title}</h3>
                      <p className="text-sm leading-6 text-foreground/90">{section.body}</p>
                      {section.bullets && section.bullets.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {section.bullets.map((bullet) => (
                            <div
                              key={bullet}
                              className="rounded-[12px] border border-border/80 bg-background/80 px-3 py-2.5 text-sm text-foreground/90"
                            >
                              {bullet}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </main>

            <aside className="hidden min-h-0 border-l border-border/80 bg-card/20 p-5 xl:block">
              <div className="sticky top-5 space-y-4">
                <Card className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    On This Page
                  </p>
                  <div className="space-y-2">
                    {activeSections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${sectionAnchor(activePage.id, section.id)}`}
                        className="block rounded-[12px] border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground/90 transition hover:bg-muted/60"
                      >
                        {section.title}
                      </a>
                    ))}
                  </div>
                </Card>

                <Card className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Quick Index
                  </p>
                  <div className="space-y-2 text-sm text-foreground/90">
                    <div className="flex items-center gap-2">
                      <SquareKanban className="size-4 text-muted-foreground" />
                      Chat, Canvas, Wiki, Brief, Nody
                    </div>
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-4 text-muted-foreground" />
                      Branching and comparisons
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers3 className="size-4 text-muted-foreground" />
                      Semantic artifacts
                    </div>
                    <div className="flex items-center gap-2">
                      <Keyboard className="size-4 text-muted-foreground" />
                      Shortcuts and habits
                    </div>
                  </div>
                </Card>
              </div>
            </aside>
          </div>
        </div>
      </WorkspaceShell>
    </div>
  );
}

function sectionAnchor(pageId: string, sectionId: string) {
  return `${pageId}-${sectionId}`;
}
