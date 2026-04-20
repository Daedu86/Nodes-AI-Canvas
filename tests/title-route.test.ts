import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetChatGovernorForTests } from "../lib/server/chat-governor";

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
  getUserModelOverrides: async () => ({}),
}));

import { POST } from "../app/api/title/route";

describe("/api/title", () => {
  beforeEach(async () => {
    await __resetChatGovernorForTests();
    createLanguageModelMock.mockImplementation((config: { provider: string; modelId: string }) => ({
      provider: config.provider,
      modelId: config.modelId,
    }));
    generateTextMock.mockResolvedValue({ text: "Mock Browser Title" });
    getMissingProviderCredentialMock.mockReturnValue(null);
  });

  afterEach(async () => {
    await __resetChatGovernorForTests();
    vi.clearAllMocks();
  });

  it("includes explicit placeholders for non-text parts in the title transcript", async () => {
    const response = await POST(
      new Request("http://localhost/api/title", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [
            {
              role: "user",
              content: [
                { type: "image", mimeType: "image/png" },
                { type: "file", filename: "brief.pdf" },
              ],
            },
            {
              role: "assistant",
              content: [{ type: "tool-result", toolName: "searchDocs", toolCallId: "call-1" }],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(generateTextMock).toHaveBeenCalledTimes(1);

    const call = generateTextMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain("[image: image/png]");
    expect(call.prompt).toContain("[file: brief.pdf]");
    expect(call.prompt).toContain("[tool result: searchDocs]");

    expect(await response.json()).toEqual({ title: "Mock Browser Title" });
  });

  it("returns a generic title error instead of raw upstream details", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider trace here"));

    const response = await POST(
      new Request("http://localhost/api/title", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [{ role: "user", content: "Name this chat" }],
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to generate a title right now.",
    });
  });
});
