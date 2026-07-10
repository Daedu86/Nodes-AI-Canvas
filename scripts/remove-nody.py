from pathlib import Path
import re
import shutil

root = Path(".")


def read(path: str) -> str:
    return (root / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def edit(path: str, transform) -> None:
    target = root / path
    if not target.exists():
        return
    source = target.read_text(encoding="utf-8")
    target.write_text(transform(source), encoding="utf-8")


write(
    "components/context/session-knowledge.tsx",
    '''"use client";

import React from "react";
import { buildSessionBrief, type SessionBrief } from "@/lib/session-brief";
import type { SessionArtifact, SessionContextLink } from "@/lib/session-artifacts";
import {
  buildSessionWiki,
  type SessionWiki,
  type SessionWikiNode,
  type SessionWikiPageId,
} from "@/lib/session-wiki";

type SessionKnowledgeSnapshot = {
  artifacts: SessionArtifact[];
  contextLinks: SessionContextLink[];
  nodes: SessionWikiNode[];
  selectedNodeId: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
};

type SessionKnowledgeContextValue = {
  brief: SessionBrief | null;
  publishSnapshot: (snapshot: SessionKnowledgeSnapshot | null) => void;
  selectedWikiPageId: SessionWikiPageId;
  setSelectedWikiPageId: (value: SessionWikiPageId) => void;
  snapshot: SessionKnowledgeSnapshot | null;
  wiki: SessionWiki | null;
};

const SessionKnowledgeContext = React.createContext<SessionKnowledgeContextValue | null>(null);

export function SessionKnowledgeProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = React.useState<SessionKnowledgeSnapshot | null>(null);
  const [selectedWikiPageId, setSelectedWikiPageId] = React.useState<SessionWikiPageId>("overview");

  const wiki = React.useMemo(
    () =>
      snapshot
        ? buildSessionWiki({
            artifacts: snapshot.artifacts,
            contextLinks: snapshot.contextLinks,
            nodes: snapshot.nodes,
            selectedNodeId: snapshot.selectedNodeId,
            sessionTitle: snapshot.sessionTitle,
          })
        : null,
    [snapshot],
  );

  const brief = React.useMemo(
    () =>
      snapshot
        ? buildSessionBrief({
            artifacts: snapshot.artifacts,
            sessionTitle: snapshot.sessionTitle,
            wiki,
          })
        : null,
    [snapshot, wiki],
  );

  React.useEffect(() => {
    setSelectedWikiPageId("overview");
  }, [snapshot?.sessionId]);

  const value = React.useMemo<SessionKnowledgeContextValue>(
    () => ({
      brief,
      publishSnapshot: setSnapshot,
      selectedWikiPageId,
      setSelectedWikiPageId,
      snapshot,
      wiki,
    }),
    [brief, selectedWikiPageId, snapshot, wiki],
  );

  return (
    <SessionKnowledgeContext.Provider value={value}>
      {children}
    </SessionKnowledgeContext.Provider>
  );
}

export function useSessionKnowledge() {
  const context = React.useContext(SessionKnowledgeContext);
  if (!context) {
    throw new Error("useSessionKnowledge must be used within SessionKnowledgeProvider");
  }
  return context;
}

export type { SessionKnowledgeSnapshot };
''',
)


def update_session_wiki(source: str) -> str:
    source = source.replace(
        'import type { CanvasGuideGraphNode } from "@/lib/canvas-agent/canvas-agent-context";\n',
        "",
    )
    marker = "export type SessionWikiPageId =\n"
    node_type = '''export type SessionWikiNode = {
  branchId?: string | number | null;
  id: string;
  parentId: string | null;
  role: string;
  text: string;
};

'''
    if marker in source and node_type not in source:
        source = source.replace(marker, node_type + marker, 1)
    source = source.replace("CanvasGuideGraphNode[]", "SessionWikiNode[]")
    return source


edit("lib/session-wiki.ts", update_session_wiki)

write(
    "lib/session-brief.ts",
    '''import {
  getSemanticArtifactLabel,
  getSessionArtifactPreview,
  type SessionArtifact,
} from "@/lib/session-artifacts";
import type { SessionWiki, SessionWikiPageId } from "@/lib/session-wiki";

export type SessionBriefSource = {
  kind: "wiki" | "node" | "artifact";
  label: string;
  preview: string | null;
  ref: string;
  targetId: SessionWikiPageId | string;
};

export type SessionBrief = {
  title: string;
  summary: string;
  recommendation: string;
  next: string | null;
  evidence: SessionBriefSource[];
  openQuestions: string[];
  signals: string[];
};

type BuildSessionBriefArgs = {
  artifacts: SessionArtifact[];
  sessionTitle: string | null;
  wiki: SessionWiki | null;
};

const parseOpenQuestions = (wiki: SessionWiki | null) => {
  const page = wiki?.pages.find((entry) => entry.id === "open-questions");
  if (!page) return [];
  return page.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter((line) => line.length > 0);
};

const getSemanticArtifacts = (
  artifacts: SessionArtifact[],
  semanticType: NonNullable<SessionArtifact["semanticType"]>,
) =>
  artifacts.filter(
    (artifact) => artifact.artifactType === "text" && artifact.semanticType === semanticType,
  );

const buildArtifactSourceEntry = (artifact: SessionArtifact): SessionBriefSource => ({
  kind: "artifact",
  label: `${getSemanticArtifactLabel(artifact.semanticType) ?? "Artifact"} · ${artifact.title}`,
  preview: getSessionArtifactPreview(artifact, 160),
  ref: `artifact:${artifact.id}`,
  targetId: artifact.id,
});

const buildSignalSummary = (artifacts: SessionArtifact[], wiki: SessionWiki | null) => {
  const semanticCounts = new Map<string, number>();
  artifacts.forEach((artifact) => {
    if (artifact.artifactType !== "text" || !artifact.semanticType) return;
    semanticCounts.set(artifact.semanticType, (semanticCounts.get(artifact.semanticType) ?? 0) + 1);
  });

  const semanticSignals = [...semanticCounts.entries()].map(([semanticType, count]) => {
    const label = semanticType.charAt(0).toUpperCase() + semanticType.slice(1);
    return `${count} ${label.toLowerCase()} artifact${count === 1 ? "" : "s"}`;
  });

  const fallbackSignals: string[] = [];
  if (wiki) {
    fallbackSignals.push(`${wiki.pages.length} wiki page${wiki.pages.length === 1 ? "" : "s"}`);
  }
  if (artifacts.length > 0) {
    fallbackSignals.push(`${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"} in canvas`);
  }

  return semanticSignals.length > 0 ? semanticSignals : fallbackSignals;
};

export const buildSessionBrief = ({
  artifacts,
  sessionTitle,
  wiki,
}: BuildSessionBriefArgs): SessionBrief => {
  const overview = wiki?.pages.find((page) => page.id === "overview");
  const focus = wiki?.pages.find((page) => page.id === "focus");
  const decisionArtifacts = getSemanticArtifacts(artifacts, "decision");
  const evidenceArtifacts = getSemanticArtifacts(artifacts, "evidence");
  const planArtifacts = getSemanticArtifacts(artifacts, "plan");
  const questionArtifacts = getSemanticArtifacts(artifacts, "question");
  const summary =
    overview?.summary ??
    `${sessionTitle?.trim() || "Untitled session"} is ready for a canonical brief.`;

  const recommendation =
    decisionArtifacts[0]?.content?.trim() ||
    focus?.summary ||
    "Pin a decision artifact in the canvas to establish the current recommendation.";
  const next = planArtifacts[0]?.content?.trim() || null;
  const evidence = evidenceArtifacts.slice(0, 4).map(buildArtifactSourceEntry);
  const openQuestions = [
    ...questionArtifacts.map(
      (artifact) => `${artifact.title}: ${getSessionArtifactPreview(artifact, 180)}`,
    ),
    ...parseOpenQuestions(wiki),
  ].filter((entry, index, array) => array.indexOf(entry) === index);

  return {
    title: sessionTitle?.trim() || "Untitled session",
    summary,
    recommendation,
    next,
    evidence,
    openQuestions: openQuestions.slice(0, 4),
    signals: buildSignalSummary(artifacts, wiki),
  };
};
''',
)


def update_assistant(source: str) -> str:
    source = source.replace(
        'import { NodyPanelProvider } from "@/components/context/nody-panel";',
        'import { SessionKnowledgeProvider } from "@/components/context/session-knowledge";',
    )
    source = re.sub(
        r"\nconst NodyPanel = dynamic\([\s\S]*?\n\);\n\nconst WikiPanel",
        "\nconst WikiPanel",
        source,
        count=1,
    )
    source = source.replace("<NodyPanelProvider>", "<SessionKnowledgeProvider>")
    source = source.replace("</NodyPanelProvider>", "</SessionKnowledgeProvider>")
    source = re.sub(r"\s*nodyPanel=\{<NodyPanel />\}\n", "\n", source)
    return source


edit("app/assistant.tsx", update_assistant)


def update_thread_graph(source: str) -> str:
    source = source.replace(
        'import { useNodyPanel } from "@/components/context/nody-panel";',
        'import { useSessionKnowledge } from "@/components/context/session-knowledge";',
    )
    source = source.replace(
        "  const { publishSnapshot } = useNodyPanel();",
        "  const { publishSnapshot } = useSessionKnowledge();",
    )
    replacement = '''  const sessionKnowledgeNodes = React.useMemo(
    () =>
      canvasConversationNodes.map((node) => ({
        branchId:
          typeof node.branchId === "string" || typeof node.branchId === "number"
            ? node.branchId
            : null,
        id: node.id,
        parentId: node.parentId,
        role: node.role,
        text: node.text,
      })),
    [canvasConversationNodes],
  );
  React.useEffect(() => {
    publishSnapshot({
      artifacts,
      contextLinks,
      nodes: sessionKnowledgeNodes,
      selectedNodeId,
      sessionId: activeSessionId,
      sessionTitle: activeSession?.title ?? null,
    });
  }, [
    activeSession?.title,
    activeSessionId,
    artifacts,
    contextLinks,
    publishSnapshot,
    selectedNodeId,
    sessionKnowledgeNodes,
  ]);

  return ('''
    source = re.sub(
        r"  const canvasGuideNodes = React\.useMemo\([\s\S]*?\n\n  return \(",
        replacement,
        source,
        count=1,
    )
    return source


edit("components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx", update_thread_graph)


def update_session_ui(source: str) -> str:
    source = source.replace(' | "nody"', "")
    source = source.replace('  "nody",\n', "")
    source = source.replace("  nody: true,\n", "")
    source = source.replace(
        "      nody: parsed.nody ?? DEFAULT_SPLIT_PANE_VISIBILITY.nody,\n", ""
    )
    source = re.sub(r'\s*\|\|\s*value === "nody"', "", source)
    return source


edit("components/context/session-ui-state.tsx", update_session_ui)


def update_header(source: str) -> str:
    source = source.replace("BookCopy, Bot, Columns2", "BookCopy, Columns2")
    source = source.replace('    { icon: Bot, label: "Nody", value: "nody" },\n', "")
    return source


edit("components/workspace/app-header.tsx", update_header)


def update_split_layout(source: str) -> str:
    source = source.replace("  Bot,\n", "")
    source = source.replace("  nodyPanel: React.ReactNode;\n", "")
    source = source.replace("  nodyPanel,\n", "")
    source = re.sub(
        r'\n      \{\n        id: "nody",[\s\S]*?\n      \},',
        "",
        source,
        count=1,
    )
    source = source.replace(
        "    [briefPanel, canvasPanel, chatPanel, nodyPanel, wikiPanel],",
        "    [briefPanel, canvasPanel, chatPanel, wikiPanel],",
    )
    source = re.sub(
        r'\n          \{viewMode === "nody" \? \([\s\S]*?\n          \) : null\}',
        "",
        source,
        count=1,
    )
    return source


edit("components/workspace/workspace-split-layout.tsx", update_split_layout)


def update_wiki_panel(source: str) -> str:
    source = source.replace(
        'import { useNodyPanel } from "@/components/context/nody-panel";',
        'import { useSessionKnowledge } from "@/components/context/session-knowledge";',
    )
    source = source.replace("useNodyPanel()", "useSessionKnowledge()")
    source = source.replace(
        "Canonical layer between canvas and Nody.",
        "Canonical layer generated from canvas context.",
    )
    source = re.sub(
        r'\n            <Button[^\n]*setViewMode\("nody"\)[\s\S]*?\n            </Button>',
        "",
        source,
        count=1,
    )
    return source


edit("components/workspace/wiki-panel.tsx", update_wiki_panel)


def update_brief_panel(source: str) -> str:
    source = source.replace(
        'import { BookCopy, FileText, Lightbulb, Telescope, Waypoints } from "lucide-react";',
        'import { BookCopy, FileText, Lightbulb, Waypoints } from "lucide-react";',
    )
    source = source.replace(
        'import { useNodyPanel } from "@/components/context/nody-panel";',
        'import { useSessionKnowledge } from "@/components/context/session-knowledge";',
    )
    source = source.replace(
        'import type { NodySourceCatalogEntry } from "@/lib/nody-insight";',
        'import type { SessionBriefSource } from "@/lib/session-brief";',
    )
    source = source.replace("useNodyPanel()", "useSessionKnowledge()")
    source = source.replace("NodySourceCatalogEntry", "SessionBriefSource")
    source = source.replace(
        "Ask Nody a concrete question and the workspace will compile a brief here.",
        "Open the canvas and add semantic artifacts to compile a session brief here.",
    )
    source = re.sub(
        r'\n                <Button[^\n]*setViewMode\("nody"\)[\s\S]*?\n                </Button>',
        "",
        source,
        count=1,
    )
    source = source.replace(
        "Ask Nody a focused question to attach explicit evidence anchors here.",
        "Add evidence artifacts to the canvas to attach evidence anchors here.",
    )
    return source


edit("components/workspace/brief-panel.tsx", update_brief_panel)


def update_readme(source: str) -> str:
    source = re.sub(
        r"\n### What is Nody\?[\s\S]*?\n## Product Tour",
        "\n## Product Tour",
        source,
        count=1,
    )
    source = source.replace(
        "6. Use **Nody** when you want a quick summary, an explanation of what’s selected, or next-step guidance.\n7. Open **Profile → LLM Models** to connect your own API keys and control what models appear.",
        "6. Open **Profile → LLM Models** to connect your own API keys and control what models appear.",
    )
    source = source.replace(
        "- **Nody**: an in-product guide that summarizes and explains your workspace.\n",
        "",
    )
    return source


edit("README.md", update_readme)

write(
    "tests/session-brief.test.ts",
    '''import { describe, expect, it } from "vitest";
import { buildSessionBrief } from "../lib/session-brief";

describe("session brief builder", () => {
  it("combines wiki and semantic artifacts into a brief", () => {
    const brief = buildSessionBrief({
      artifacts: [
        {
          artifactType: "text",
          content: "Ship the wiki first.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "decision-1",
          semanticType: "decision",
          title: "Decision 1",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "Publish the migration checklist.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "plan-1",
          semanticType: "plan",
          title: "Rollout plan",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      sessionTitle: "Nodes",
      wiki: {
        digest: "digest",
        pages: [
          {
            body: "Session body",
            id: "overview",
            summary: "Nodes has 8 nodes and 2 branches.",
            title: "Overview",
          },
          {
            body: "- Q1: Should the brief be the final export?\n- Q2: How strict should citations be?",
            id: "open-questions",
            summary: "Two open questions remain.",
            title: "Open Questions",
          },
        ],
      },
    });

    expect(brief.summary).toBe("Nodes has 8 nodes and 2 branches.");
    expect(brief.recommendation).toContain("Ship the wiki first");
    expect(brief.next).toBe("Publish the migration checklist.");
    expect(brief.openQuestions).toEqual([
      "Q1: Should the brief be the final export?",
      "Q2: How strict should citations be?",
    ]);
    expect(brief.signals[0]).toContain("decision artifact");
  });

  it("uses evidence and question artifacts without an AI guide", () => {
    const brief = buildSessionBrief({
      artifacts: [
        {
          artifactType: "text",
          content: "Adopt semantic artifacts before adding more providers.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "decision-1",
          semanticType: "decision",
          title: "Priority decision",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "The current canvas already supports typed semantic notes.",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "evidence-1",
          semanticType: "evidence",
          title: "Canvas evidence",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
        {
          artifactType: "text",
          content: "How should merge work across worlds?",
          createdAt: "2026-04-09T00:00:00.000Z",
          id: "question-1",
          semanticType: "question",
          title: "Merge worlds",
          updatedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      sessionTitle: "Nodes",
      wiki: null,
    });

    expect(brief.recommendation).toContain("Adopt semantic artifacts");
    expect(brief.evidence).toEqual([
      expect.objectContaining({ kind: "artifact", ref: "artifact:evidence-1" }),
    ]);
    expect(brief.openQuestions[0]).toContain("Merge worlds");
  });
});
''',
)

write(
    "tests/workspace-split-layout.test.tsx",
    '''// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  SessionUiStateProvider,
  useSessionUiState,
} from "../components/context/session-ui-state";
import { WorkspaceSplitLayout } from "../components/workspace/workspace-split-layout";

function LayoutHarness() {
  const { setViewMode, viewMode } = useSessionUiState();

  return (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <button type="button" onClick={() => setViewMode("chat")}>Show chat</button>
      <button type="button" onClick={() => setViewMode("split")}>Show split</button>
      <button type="button" onClick={() => setViewMode("canvas")}>Show canvas</button>
      <button type="button" onClick={() => setViewMode("wiki")}>Show Wiki</button>
      <button type="button" onClick={() => setViewMode("brief")}>Show Brief</button>
      <div style={{ width: 1200, height: 800 }}>
        <WorkspaceSplitLayout
          chatPanel={<div data-testid="chat-panel">chat</div>}
          canvasPanel={<div data-testid="canvas-panel">canvas</div>}
          wikiPanel={<div data-testid="wiki-panel">wiki</div>}
          briefPanel={<div data-testid="brief-panel">brief</div>}
        />
      </div>
    </div>
  );
}

function renderLayout(sessionId: string) {
  return render(
    <SessionUiStateProvider sessionId={sessionId}>
      <LayoutHarness />
    </SessionUiStateProvider>,
  );
}

describe("WorkspaceSplitLayout", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("persists the main panel view mode per session", () => {
    const { unmount } = renderLayout("session-a");

    expect(screen.getByTestId("view-mode").textContent).toBe("split");
    expect(screen.queryByTestId("chat-panel")).not.toBeNull();
    expect(screen.queryByTestId("canvas-panel")).not.toBeNull();
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide Brief pane in split" }));
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show Wiki" }));
    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    unmount();
    renderLayout("session-a");
    expect(screen.getByTestId("view-mode").textContent).toBe("wiki");

    fireEvent.click(screen.getByRole("button", { name: "Show split" }));
    expect(screen.queryByTestId("chat-panel")).not.toBeNull();
    expect(screen.queryByTestId("canvas-panel")).not.toBeNull();
    expect(screen.queryByTestId("wiki-panel")).not.toBeNull();
    expect(screen.queryByTestId("brief-panel")).toBeNull();

    cleanup();
    renderLayout("session-b");
    expect(screen.getByTestId("view-mode").textContent).toBe("split");
    expect(screen.queryByTestId("brief-panel")).not.toBeNull();
  });
});
''',
)

for path in [
    "components/context/nody-panel.tsx",
    "components/workspace/nody-panel.tsx",
    "lib/nody-insight.ts",
    "tests/nody-insight.test.ts",
    "tests/canvas-agent-context.test.ts",
]:
    target = root / path
    if target.exists():
        target.unlink()

for path in [
    "app/api/canvas-agent",
    "lib/canvas-agent",
    "components/assistant-ui/thread-graph-flow/canvas-agent",
]:
    target = root / path
    if target.exists():
        shutil.rmtree(target)

for path in [
    ".github/workflows/remove-nody.yml",
    ".github/workflows/remove-nody-direct.yml",
    "scripts/remove-nody.py",
]:
    target = root / path
    if target.exists():
        target.unlink()
