import { describe, expect, it } from "vitest";
import {
  buildCanvasGuidePayload,
  buildCanvasGuideSourceCatalog,
  getCanvasGuideActionLabel,
} from "../lib/canvas-agent/canvas-agent-context";

describe("canvas guide context", () => {
  it("builds a focused payload for a selected conversation node", () => {
    const payload = buildCanvasGuidePayload({
      action: "explain-focus",
      artifacts: [
        {
          artifactType: "text",
          content: "Reusable architecture note",
          createdAt: "2026-03-27T10:00:00.000Z",
          id: "artifact-1",
          title: "Architecture note",
          updatedAt: "2026-03-27T10:00:00.000Z",
        },
      ],
      contextLinks: [
        {
          artifactId: "artifact-1",
          createdAt: "2026-03-27T10:01:00.000Z",
          id: "link-1",
          targetMessageId: "assistant-1",
        },
      ],
      historyMode: "full",
      modelId: "nvidia/nemotron-3-super-120b-a12b:free",
      nodes: [
        { id: "__ROOT__", parentId: null, role: "ROOT", text: "Conversation Root" },
        { id: "user-1", parentId: "__ROOT__", role: "user", text: "How should we structure the graph?" },
        {
          branchId: "main",
          id: "assistant-1",
          parentId: "user-1",
          provider: "openrouter",
          role: "assistant",
          text: "Use React Flow and preserve branch semantics.",
        },
      ],
      edges: [
        {
          id: "edge-user-assistant",
          source: "user-1",
          target: "assistant-1",
          tone: "default",
        },
      ],
      provider: "openrouter",
      selectedEdgeId: null,
      selectedNodeId: "assistant-1",
      sessionId: "session-1",
      sessionTitle: "Canvas guide test",
    });

    expect(getCanvasGuideActionLabel("explain-focus")).toBe("Explain focus");
    expect(payload.focus).toMatchObject({
      kind: "message",
      id: "assistant-1",
      role: "assistant",
    });
    if (payload.focus.kind === "message") {
      expect(payload.focus.linkedArtifacts).toEqual([
        {
          artifactType: "text",
          id: "artifact-1",
          title: "Architecture note",
        },
      ]);
    }
    expect(payload.branch.nodeCount).toBe(2);
    expect(payload.branch.transcript).toContain("user: How should we structure the graph?");
    expect(payload.branch.transcript).toContain("assistant: Use React Flow and preserve branch semantics.");
  });

  it("builds an artifact focus with linked message targets", () => {
    const payload = buildCanvasGuidePayload({
      action: "survey-tree",
      artifacts: [
        {
          artifactType: "text",
          content: "This branch should stay focused on evidence before deciding.",
          createdAt: "2026-03-27T10:00:00.000Z",
          id: "artifact-code",
          semanticType: "evidence",
          title: "Flow snippet",
          updatedAt: "2026-03-27T10:00:00.000Z",
        },
      ],
      contextLinks: [
        {
          artifactId: "artifact-code",
          createdAt: "2026-03-27T10:01:00.000Z",
          id: "link-code",
          targetMessageId: "user-1",
        },
      ],
      historyMode: "last",
      modelId: "stepfun/step-3.5-flash:free",
      nodes: [
        { id: "__ROOT__", parentId: null, role: "ROOT", text: "Conversation Root" },
        { id: "user-1", parentId: "__ROOT__", role: "user", text: "Investigate branching performance." },
      ],
      edges: [],
      provider: "openrouter",
      selectedEdgeId: null,
      selectedNodeId: "artifact-code",
      sessionId: "session-2",
      sessionTitle: "Artifact focus",
    });

    expect(payload.focus).toMatchObject({
      kind: "artifact",
      id: "artifact-code",
      artifactType: "text",
    });
    if (payload.focus.kind === "artifact") {
      expect(payload.focus.linkedTargets).toEqual([
        {
          id: "user-1",
          preview: "Investigate branching performance.",
          role: "user",
        },
      ]);
    }
    expect(payload.tree.artifactCount).toBe(1);
    expect(payload.tree.nodeCount).toBe(1);
    expect(payload.artifacts.previewArtifacts[0]).toMatchObject({
      id: "artifact-code",
      semanticType: "evidence",
    });
  });

  it("includes semantic artifacts in the Nody source catalog even when they are not selected", () => {
    const payload = buildCanvasGuidePayload({
      action: "survey-tree",
      artifacts: [
        {
          artifactType: "text",
          content: "Ship the brief after we lock the citations.",
          createdAt: "2026-03-27T10:00:00.000Z",
          id: "artifact-decision",
          semanticType: "decision",
          title: "Launch sequence",
          updatedAt: "2026-03-27T10:00:00.000Z",
        },
      ],
      contextLinks: [],
      historyMode: "last",
      modelId: "stepfun/step-3.5-flash:free",
      nodes: [{ id: "__ROOT__", parentId: null, role: "ROOT", text: "Conversation Root" }],
      edges: [],
      provider: "openrouter",
      selectedEdgeId: null,
      selectedNodeId: null,
      sessionId: "session-2",
      sessionTitle: "Artifact sources",
    });

    const catalog = buildCanvasGuideSourceCatalog(payload);
    expect(catalog).toContainEqual(
      expect.objectContaining({
        kind: "artifact",
        label: "Decision · Launch sequence",
        ref: "artifact:artifact-decision",
      }),
    );
  });

  it("builds a branch focus when the guide stands over an edge", () => {
    const payload = buildCanvasGuidePayload({
      action: "summarize-branch",
      artifacts: [],
      contextLinks: [],
      edges: [
        {
          id: "edge-root-user",
          label: "branch",
          source: "__ROOT__",
          target: "user-1",
          tone: "default",
        },
      ],
      historyMode: "full",
      modelId: "stepfun/step-3.5-flash:free",
      nodes: [
        { id: "__ROOT__", parentId: null, role: "ROOT", text: "Conversation Root" },
        { id: "user-1", parentId: "__ROOT__", role: "user", text: "Explore alternative onboarding flows." },
        {
          id: "assistant-1",
          parentId: "user-1",
          role: "assistant",
          text: "We should split the flow into activation and education.",
        },
      ],
      provider: "openrouter",
      selectedEdgeId: "edge-root-user",
      selectedNodeId: null,
      sessionId: "session-3",
      sessionTitle: "Branch focus",
    });

    expect(payload.focus).toMatchObject({
      kind: "branch",
      id: "edge-root-user",
      sourceId: "__ROOT__",
      targetId: "user-1",
      targetRole: "user",
    });
    expect(payload.focus.label).toContain("Conversation root");
    expect(payload.branch.nodeCount).toBe(2);
    expect(payload.branch.transcript).toContain("user: Explore alternative onboarding flows.");
    expect(payload.branch.transcript).toContain(
      "assistant: We should split the flow into activation and education.",
    );
  });
});
