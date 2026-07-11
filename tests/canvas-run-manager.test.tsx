
// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanvasRunManager } from "../components/assistant-ui/thread-graph-flow/use-canvas-run-manager";
import type { SessionArtifact, SessionCanvasLink } from "../lib/session-artifacts";

const now = "2026-07-11T00:00:00.000Z";

const prompt = (id: string): SessionArtifact => ({
  artifactType: "prompt",
  content: `Prompt ${id}`,
  createdAt: now,
  id,
  position: null,
  promptStatus: "idle",
  revisions: [],
  semanticType: null,
  syncMode: "auto",
  title: `Prompt ${id}`,
  updatedAt: now,
});

const output = (id: string): SessionArtifact => ({
  artifactType: "text",
  content: "",
  createdAt: now,
  id,
  position: null,
  revisions: [],
  semanticType: "plan",
  syncMode: "auto",
  title: id,
  updatedAt: now,
});

function Harness({ links }: { links: SessionCanvasLink[] }) {
  const [items, setItems] = React.useState<SessionArtifact[]>([
    prompt("a"),
    prompt("b"),
    prompt("c"),
    output("out-a"),
    output("out-b"),
    output("out-c"),
  ]);
  const prompts = items.filter((item) => item.artifactType === "prompt");
  const artifacts = items.filter((item) => item.artifactType !== "prompt");
  const updateArtifact = React.useCallback((artifactId: string, patch: Partial<SessionArtifact>) => {
    setItems((current) =>
      current.map((item) => (item.id === artifactId ? { ...item, ...patch } : item)),
    );
  }, []);
  const manager = useCanvasRunManager({
    applyCompletedResponse: () => ({ capturedArtifactIds: [], skippedArtifactIds: [] }),
    artifacts,
    canvasLinks: links,
    enabled: true,
    maxConcurrent: 3,
    model: "openrouter/free",
    prompts,
    provider: "openrouter",
    updateArtifact,
  });
  return (
    <div>
      <button onClick={() => manager.runPrompt("a")}>Run A</button>
      <button onClick={() => manager.runPrompt("b")}>Run B</button>
      <button onClick={() => manager.runPrompt("c")}>Run C</button>
      <div data-testid="counts">{manager.activeCount}:{manager.queuedCount}</div>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useCanvasRunManager", () => {
  it("dispatches three free-tier prompts concurrently", async () => {
    const resolvers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; provider: string };
      expect(body.model).toBe("openrouter/free");
      expect(body.provider).toBe("openrouter");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      active -= 1;
      return new Response(JSON.stringify({ text: "done", modelId: body.model, provider: body.provider }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const links: SessionCanvasLink[] = [
      { id: "a-out", relation: "output", artifactId: "out-a", promptId: "a", responseId: null, createdAt: now },
      { id: "b-out", relation: "output", artifactId: "out-b", promptId: "b", responseId: null, createdAt: now },
      { id: "c-out", relation: "output", artifactId: "out-c", promptId: "c", responseId: null, createdAt: now },
    ];
    render(<Harness links={links} />);
    await act(async () => {
      screen.getByRole("button", { name: "Run A" }).click();
      screen.getByRole("button", { name: "Run B" }).click();
      screen.getByRole("button", { name: "Run C" }).click();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(3);
    await act(async () => {
      resolvers.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("serializes runs that share an output artifact", async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn(async () => {
      await new Promise<void>((resolve) => resolvers.push(resolve));
      return new Response(JSON.stringify({ text: "done", modelId: "openrouter/free", provider: "openrouter" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const links: SessionCanvasLink[] = [
      { id: "a-out", relation: "output", artifactId: "out-a", promptId: "a", responseId: null, createdAt: now },
      { id: "b-out", relation: "output", artifactId: "out-a", promptId: "b", responseId: null, createdAt: now },
    ];
    render(<Harness links={links} />);
    await act(async () => {
      screen.getByRole("button", { name: "Run A" }).click();
      screen.getByRole("button", { name: "Run B" }).click();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvers.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolvers.shift()?.();
      await Promise.resolve();
    });
  });
});
