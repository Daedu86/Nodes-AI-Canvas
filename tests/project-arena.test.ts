import { describe, expect, it } from "vitest";
import type { SessionDocument } from "../lib/session-documents";
import {
  buildProjectArenaBranchEntries,
  buildProjectArenaSessionEntry,
  buildProjectArenaSummary,
} from "../lib/project-arena";
import type { ProjectMemoryItem } from "../lib/memory-documents";

const makeSession = ({
  id,
  title,
  messages,
  artifacts = 0,
}: {
  artifacts?: number;
  id: string;
  messages: Array<{ content: string; id: string; parentId: string | null; role: "assistant" | "user" }>;
  title: string;
}): SessionDocument => ({
  archived: false,
  artifacts: Array.from({ length: artifacts }, (_, index) => ({
    artifactType: "text",
    content: `Artifact ${index + 1}`,
    createdAt: "2026-03-30T09:00:00.000Z",
    id: `${id}-artifact-${index + 1}`,
    title: `Artifact ${index + 1}`,
    updatedAt: "2026-03-30T09:00:00.000Z",
  })),
  contextLinks: [],
  createdAt: "2026-03-30T09:00:00.000Z",
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
  updatedAt: "2026-03-30T10:00:00.000Z",
});

describe("project-arena", () => {
  const sharedMemory: ProjectMemoryItem[] = [
    {
      content: "Promote the strongest branch and preserve reusable evidence.",
      createdAt: "2026-03-30T09:00:00.000Z",
      id: "memory-1",
      sourceKeys: ["session-a", "session-b"],
      sourceKind: "session",
      sourceProjectId: "project-1",
      sourceSessionId: null,
      title: "Project north star",
      type: "summary",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
  ];

  it("builds comparable arena entries from a session", () => {
    const entry = buildProjectArenaSessionEntry(
      makeSession({
        id: "session-a",
        title: "Architecture options",
        messages: [
          { content: "How should the graph scale?", id: "u1", parentId: null, role: "user" },
          { content: "Use a project-level canvas.", id: "a1", parentId: "u1", role: "assistant" },
          { content: "Compare it with a tabbed UI.", id: "u2", parentId: null, role: "user" },
          { content: "A canvas is better for branches.", id: "a2", parentId: "u2", role: "assistant" },
        ],
        artifacts: 1,
      }),
    );

    expect(entry).toMatchObject({
      artifactCount: 1,
      artifactTitles: ["Artifact 1"],
      branchGroups: 1,
      latestAssistant: "A canvas is better for branches.",
      openingPrompt: "How should the graph scale?",
      rootCount: 2,
      sessionId: "session-a",
      title: "Architecture options",
    });
    expect(entry.score).toBeGreaterThan(0);
  });

  it("summarizes compared sessions and picks a lead candidate", () => {
    const entries = [
      buildProjectArenaSessionEntry(
        makeSession({
          id: "session-a",
          title: "Exploration",
          messages: [
            { content: "Explore option A", id: "u1", parentId: null, role: "user" },
            { content: "Option A is broad.", id: "a1", parentId: "u1", role: "assistant" },
            { content: "Explore option B", id: "u2", parentId: null, role: "user" },
            { content: "Option B adds branches.", id: "a2", parentId: "u2", role: "assistant" },
          ],
          artifacts: 2,
        }),
      ),
      buildProjectArenaSessionEntry(
        makeSession({
          id: "session-b",
          title: "Tighter scope",
          messages: [
            { content: "Refine the lead idea", id: "u1", parentId: null, role: "user" },
            { content: "Keep it lean.", id: "a1", parentId: "u1", role: "assistant" },
          ],
        }),
      ),
    ];

    const summary = buildProjectArenaSummary(
      entries,
      "We are trying to decide a project direction.",
      sharedMemory,
    );

    expect(summary).not.toBeNull();
    expect(summary?.leadKey).toBe("session-a");
    expect(summary?.sharedMemoryTitles).toEqual(["Project north star"]);
    expect(summary?.summary).toContain("lead candidate");
    expect(summary?.note).toContain("Project Arena session synthesis");
  });

  it("builds root-branch entries and summarizes compared branches", () => {
    const session = makeSession({
      id: "session-branches",
      title: "Branch Lab",
      messages: [
        { content: "Root branch one", id: "u1", parentId: null, role: "user" },
        { content: "Branch one reply", id: "a1", parentId: "u1", role: "assistant" },
        { content: "Branch one follow-up", id: "u2", parentId: "a1", role: "user" },
        { content: "Branch one deeper reply", id: "a2", parentId: "u2", role: "assistant" },
        { content: "Root branch two", id: "u3", parentId: null, role: "user" },
        { content: "Branch two reply", id: "a3", parentId: "u3", role: "assistant" },
      ],
      artifacts: 1,
    });

    const branches = buildProjectArenaBranchEntries(session);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toMatchObject({
      key: "session-branches:u1",
      kind: "branch",
      rootMessageId: "u1",
      sessionId: "session-branches",
      sessionTitle: "Branch Lab",
    });

    const summary = buildProjectArenaSummary(branches, "", sharedMemory);
    expect(summary).not.toBeNull();
    expect(summary?.kind).toBe("branch");
    expect(summary?.leadKey).toBe("session-branches:u1");
    expect(summary?.note).toContain("Project Arena branch synthesis");
    expect(summary?.note).toContain("Project north star");
  });
});
