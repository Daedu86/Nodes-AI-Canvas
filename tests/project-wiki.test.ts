import { describe, expect, it } from "vitest";
import type { ProjectMemoryItem } from "../lib/memory-documents";
import type { ProjectDocument } from "../lib/project-documents";
import type { SessionDocument } from "../lib/session-documents";
import { buildProjectWiki } from "../lib/project-wiki";

const sessionA: SessionDocument = {
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-04-04T10:00:00.000Z",
  id: "session-a",
  messageCount: 2,
  snapshot: {
    headId: "a2",
    messages: [
      {
        message: { id: "a1", role: "user", content: "What is the best architecture?" },
        parentId: null,
      },
      {
        message: { id: "a2", role: "assistant", content: "A modular system looks safer." },
        parentId: "a1",
      },
    ],
  },
  title: "Architecture",
  updatedAt: "2026-04-04T10:05:00.000Z",
};

const sessionB: SessionDocument = {
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-04-04T11:00:00.000Z",
  id: "session-b",
  messageCount: 2,
  snapshot: {
    headId: "b2",
    messages: [
      {
        message: { id: "b1", role: "user", content: "What risk should we watch?" },
        parentId: null,
      },
      {
        message: { id: "b2", role: "assistant", content: "State drift across agents is the main risk." },
        parentId: "b1",
      },
    ],
  },
  title: "Risks",
  updatedAt: "2026-04-04T11:05:00.000Z",
};

const memoryItems: ProjectMemoryItem[] = [
  {
    content: "Choose a modular coordinator with explicit ownership boundaries.",
    createdAt: "2026-04-04T12:00:00.000Z",
    id: "memory-decision",
    sourceKeys: ["session-a:a2"],
    sourceKind: "branch",
    sourceProjectId: "project-1",
    sourceSessionId: "session-a",
    title: "Architecture decision",
    type: "decision",
    updatedAt: "2026-04-04T12:00:00.000Z",
  },
  {
    content: "How should project memory be promoted into the wiki?",
    createdAt: "2026-04-04T12:10:00.000Z",
    id: "memory-question",
    sourceKeys: ["session-b:b1"],
    sourceKind: "branch",
    sourceProjectId: "project-1",
    sourceSessionId: "session-b",
    title: "Promotion question",
    type: "question",
    updatedAt: "2026-04-04T12:10:00.000Z",
  },
];

const project: ProjectDocument = {
  accessRole: "owner",
  arenaWinnerBranchKey: null,
  arenaWinnerSessionId: "session-a",
  createdAt: "2026-04-04T09:00:00.000Z",
  globalContext: "The system should compile project knowledge into a durable wiki layer.",
  id: "project-1",
  memoryIds: ["memory-decision", "memory-question"],
  members: [
    {
      addedAt: "2026-04-04T09:30:00.000Z",
      email: "collab@example.com",
      role: "editor",
    },
  ],
  sessionCount: 2,
  sessionIds: ["session-a", "session-b"],
  title: "Nody Knowledge",
  updatedAt: "2026-04-04T12:15:00.000Z",
};

describe("buildProjectWiki", () => {
  it("compiles canonical project knowledge pages from sessions, context, and typed nodes", () => {
    const wiki = buildProjectWiki({
      focus: {
        kind: "node",
        label: "Architecture decision",
        memoryId: "memory-decision",
        memoryType: "decision",
        preview: "Choose a modular coordinator with explicit ownership boundaries.",
        role: "memory",
        sessionId: "session-a",
        sessionTitle: "Architecture",
      },
      memoryItems,
      project,
      sessions: [sessionA, sessionB],
    });

    expect(wiki.pages.map((page) => page.id)).toEqual([
      "overview",
      "sessions",
      "knowledge",
      "decisions",
      "focus",
      "open-questions",
    ]);

    expect(wiki.digest).toContain("Nody Knowledge");
    expect(wiki.digest).toContain("The system should compile project knowledge into a durable wiki layer.");

    const decisionsPage = wiki.pages.find((page) => page.id === "decisions");
    expect(decisionsPage?.body).toContain("Architecture decision");
    expect(decisionsPage?.body).toContain("Session winner · Architecture");

    const openQuestionsPage = wiki.pages.find((page) => page.id === "open-questions");
    expect(openQuestionsPage?.body).toContain("Promotion question");
    expect(openQuestionsPage?.body).toContain("Architecture: What is the best architecture?");
    expect(openQuestionsPage?.body).toContain("Risks: What risk should we watch?");

    const focusPage = wiki.pages.find((page) => page.id === "focus");
    expect(focusPage?.summary).toContain("Architecture decision");
    expect(focusPage?.body).toContain("Typed node: decision");
  });
});
