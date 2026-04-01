import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  frontendToolsMock,
  ollamaMock,
  openrouterClientMock,
  createUIMessageStreamMock,
  createUIMessageStreamResponseMock,
  streamTextMock,
} = vi.hoisted(() => ({
  frontendToolsMock: vi.fn(),
  ollamaMock: vi.fn(),
  openrouterClientMock: vi.fn(),
  createUIMessageStreamMock: vi.fn(),
  createUIMessageStreamResponseMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock("ai", () => ({
  createUIMessageStream: createUIMessageStreamMock,
  createUIMessageStreamResponse: createUIMessageStreamResponseMock,
  streamText: streamTextMock,
}));

vi.mock("@assistant-ui/react-ai-sdk", () => ({
  frontendTools: frontendToolsMock,
}));

vi.mock("ollama-ai-provider", () => ({
  ollama: ollamaMock,
}));

vi.mock("@/lib/llm/openrouter", () => ({
  openrouterClient: openrouterClientMock,
}));

import { POST } from "../app/api/chat/route";

describe("/api/chat", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    createUIMessageStreamMock.mockReturnValue("mock-ui-stream");
    createUIMessageStreamResponseMock.mockImplementation(() => new Response(null, { status: 200 }));
    frontendToolsMock.mockReturnValue({});
    ollamaMock.mockImplementation((modelId: string) => ({ provider: "ollama", modelId }));
    openrouterClientMock.mockImplementation((modelId: string) => ({
      provider: "openrouter",
      modelId,
    }));
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok", { status: 200 }),
    });
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.clearAllMocks();
  });

  it("returns an empty stream response when no messages are provided", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createUIMessageStreamMock).toHaveBeenCalledTimes(1);
    expect(createUIMessageStreamResponseMock).toHaveBeenCalledWith({ stream: "mock-ui-stream" });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("normalizes browser content arrays and sends only the latest user message by default", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [
            { id: "u0", role: "user", content: "mensaje viejo" },
            { id: "a0", role: "assistant", content: "respuesta vieja" },
            {
              id: "u1",
              role: "user",
              content: [
                { type: "text", text: "Hola" },
                { type: "text", text: "responde OK" },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(openrouterClientMock).toHaveBeenCalledWith(
      "nvidia/nemotron-3-super-120b-a12b:free",
    );
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "Hola\nresponde OK" }],
      }),
    );
  });

  it("preserves non-text parts through explicit placeholders when full history is requested", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          historyMode: "full",
          messages: [
            {
              id: "a0",
              role: "assistant",
              content: [{ type: "tool-call", toolName: "searchDocs", toolCallId: "call-1" }],
            },
            {
              id: "a1",
              role: "assistant",
              content: [{ type: "tool-result", toolName: "searchDocs", toolCallId: "call-1" }],
            },
            {
              id: "u1",
              role: "user",
              content: [
                { type: "image", mimeType: "image/png" },
                { type: "file", filename: "brief.pdf" },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "assistant", content: "[tool call: searchDocs]" },
          { role: "assistant", content: "[tool result: searchDocs]" },
          { role: "user", content: "[image: image/png]\n[file: brief.pdf]" },
        ],
      }),
    );
  });

  it("reads context artifacts from metadata.custom for branch-created runs", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          metadata: {
            custom: {
              contextArtifacts: [
                {
                  id: "artifact-1",
                  title: "Spec Note",
                  artifactType: "text",
                  content: "Use this as supporting context.",
                },
              ],
            },
          },
          messages: [{ id: "u1", role: "user", content: "Follow-up with artifact context" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: undefined,
      }),
    );
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: expect.stringContaining("Attached context artifacts:") },
          { role: "user", content: "Follow-up with artifact context" },
        ],
      }),
    );
  });

  it("returns a generic client-safe error message from the stream layer", async () => {
    streamTextMock.mockReturnValueOnce({
      toUIMessageStreamResponse: ({ onError }: { onError: (error: unknown) => string }) =>
        new Response(onError(new Error("upstream provider trace")), { status: 500 }),
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [{ id: "u1", role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("The assistant request could not be completed.");
  });
});
