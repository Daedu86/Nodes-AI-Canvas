import { describe, expect, it } from "vitest";
import type { ProjectMemoryItem } from "../lib/memory-documents";
import type { ProjectDocument } from "../lib/project-documents";
import type { SessionDocument } from "../lib/session-documents";
import { buildProjectArenaBranchEntries, buildProjectArenaSummary } from "../lib/project-arena";
import {
  buildProjectContextDraft,
  buildProjectContextSources,
  getDefaultProjectContextSourceIds,
} from "../lib/project-context-builder";

const makeSession = ({
  id,
  title,
  messages,
}: {
  id: string;
  messages: Array<{ content: string; id: string; parentId: string | null; role: "assistant" | "user" }>;
  title: string;
}): SessionDocument => ({
  archived: false,
  artifacts: [],
  contextLinks: [],
  createdAt: "2026-04-01T09:00:00.000Z",
  id,
  messageCount: messages.length,
  snapshot: {
    headId: messages.at(-1)?.id ?? null,
    messages: messages.map((message) => ({
      parentId: message.parentId,
      message: {
        content: message.content,
        id: message.id,
        role: message.role,
      },
    })),
  },
  title,
  updatedAt: "2026-04-01T10:00:00.000Z",
});

describe("project-context-builder", () => {
  const sessions = [
    makeSession({
      id: "session-a",
      title: "Exploration",
      messages: [
        { content: "Explore option A", id: "u1", parentId: null, role: "user" },
        { content: "Option A is broad.", id: "a1", parentId: "u1", role: "assistant" },
        { content: "Explore option B", id: "u2", parentId: null, role: "user" },
        { content: "Option B adds branches.", id: "a2", parentId: "u2", role: "assistant" },
      ],
    }),
    makeSession({
      id: "session-b",
      title: "Decision work",
      messages: [
        { content: "Pick a direction", id: "u1", parentId: null, role: "user" },
        { content: "Prefer the branching canvas.", id: "a1", parentId: "u1", role: "assistant" },
      ],
    }),
  ];

  const project: ProjectDocument = {
    arenaWinnerBranchKey: null,
    arenaWinnerSessionId: "session-b",
    createdAt: "2026-04-01T09:00:00.000Z",
    globalContext: "",
    id: "project-1",
    memoryIds: ["memory-1", "memory-2"],
    sessionCount: 2,
    sessionIds: ["session-a", "session-b"],
    title: "AI Canvas",
    updatedAt: "2026-04-01T10:00:00.000Z",
  };

  const memoryItems: ProjectMemoryItem[] = [
    {
      content: "We should commit to the branching canvas direction.",
      createdAt: "2026-04-01T09:00:00.000Z",
      id: "memory-1",
      sourceKeys: ["session-b"],
      sourceKind: "session",
      sourceProjectId: "project-1",
      sourceSessionId: "session-b",
      title: "Final decision",
      type: "decision",
      updatedAt: "2026-04-01T10:00:00.000Z",
    },
    {
      content: "The best path is the one that keeps branch semantics visible.",
      createdAt: "2026-04-01T09:00:00.000Z",
      id: "memory-2",
      sourceKeys: ["session-a:u1", "session-b:u1"],
      sourceKind: "branch",
      sourceProjectId: "project-1",
      sourceSessionId: "session-b",
      title: "Arena merge",
      type: "merge",
      updatedAt: "2026-04-01T10:30:00.000Z",
    },
  ];

  it("builds context sources from arena, winner, memory, focus, and sessions", () => {
    const branchCatalog = sessions.flatMap((session) => buildProjectArenaBranchEntries(session));
    const summary = buildProjectArenaSummary(branchCatalog.slice(0, 2), "", memoryItems);
    const sources = buildProjectContextSources({
      arenaSummary: summary,
      attachedMemoryItems: memoryItems,
      branchCatalog,
      project,
      selectedFocus: {
        kind: "node",
        label: "Final decision",
        memoryId: "memory-1",
        memoryType: "decision",
        preview: "Prefer the branching canvas.",
        role: "memory",
        sessionId: "session-b",
        sessionTitle: "Decision work",
      },
      sessions,
    });

    expect(sources.map((source) => source.category)).toEqual(
      expect.arrayContaining(["arena", "winner", "memory", "focus", "session"]),
    );
    expect(sources.some((source) => source.title === "Final decision")).toBe(true);
    expect(sources.some((source) => source.title === "Exploration")).toBe(true);
  });

  it("selects strategic defaults and composes a combined context draft", () => {
    const branchCatalog = sessions.flatMap((session) => buildProjectArenaBranchEntries(session));
    const summary = buildProjectArenaSummary(branchCatalog.slice(0, 2), "", memoryItems);
    const sources = buildProjectContextSources({
      arenaSummary: summary,
      attachedMemoryItems: memoryItems,
      branchCatalog,
      project,
      selectedFocus: null,
      sessions,
    });

    const selectedIds = getDefaultProjectContextSourceIds(sources);
    const draft = buildProjectContextDraft(
      sources.filter((source) => selectedIds.includes(source.id)),
    );

    expect(selectedIds.length).toBeGreaterThan(0);
    expect(draft.text).toContain("[Arena synthesis]");
    expect(draft.text).toContain("[Decision] Final decision");
    expect(draft.text).toContain("[Merge] Arena merge");
    expect(draft.estimatedTokens).toBeGreaterThan(0);
  });
});
