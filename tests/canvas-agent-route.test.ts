import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateTextMock,
  ollamaMock,
  openrouterClientMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  ollamaMock: vi.fn(),
  openrouterClientMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("ollama-ai-provider", () => ({
  ollama: ollamaMock,
}));

vi.mock("@/lib/llm/openrouter", () => ({
  openrouterClient: openrouterClientMock,
}));

import { POST } from "../app/api/canvas-agent/route";

describe("/api/canvas-agent", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    ollamaMock.mockImplementation((modelId: string) => ({ provider: "ollama", modelId }));
    openrouterClientMock.mockImplementation((modelId: string) => ({ provider: "openrouter", modelId }));
    generateTextMock.mockResolvedValue({ text: "Guide response" });
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.clearAllMocks();
  });

  it("returns a generic guide error instead of raw provider details", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("trace from provider"));

    const response = await POST(
      new Request("http://localhost/api/canvas-agent", {
        method: "POST",
        body: JSON.stringify({
          action: "explain-focus",
          payload: {
            focus: { kind: "tree", id: "tree", label: "Workspace tree" },
            branch: { nodeCount: 1, transcript: "" },
            tree: { nodeCount: 1, artifactCount: 0, branchCount: 1 },
            session: {
              id: "session-1",
              title: "Session",
              provider: "openrouter",
              modelId: "nvidia/nemotron-3-super-120b-a12b:free",
              historyMode: "last",
            },
          },
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to reach the canvas guide right now.",
    });
  });
});
