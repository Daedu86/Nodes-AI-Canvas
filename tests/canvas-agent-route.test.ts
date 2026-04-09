import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createLanguageModelMock, generateTextMock, getMissingProviderCredentialMock } = vi.hoisted(
  () => ({
    createLanguageModelMock: vi.fn(),
    generateTextMock: vi.fn(),
    getMissingProviderCredentialMock: vi.fn(),
  }),
);

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("@/lib/llm/provider-runtime", () => ({
  createLanguageModel: createLanguageModelMock,
  getMissingProviderCredential: getMissingProviderCredentialMock,
  getRequestModelOverrides: () => ({}),
}));

import { POST } from "../app/api/canvas-agent/route";

describe("/api/canvas-agent", () => {
  beforeEach(() => {
    createLanguageModelMock.mockImplementation((config: { provider: string; modelId: string }) => ({
      provider: config.provider,
      modelId: config.modelId,
    }));
    generateTextMock.mockResolvedValue({ text: "Guide response" });
    getMissingProviderCredentialMock.mockReturnValue(null);
  });

  afterEach(() => {
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
