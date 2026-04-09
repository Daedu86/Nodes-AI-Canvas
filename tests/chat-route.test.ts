import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetChatGovernorForTests } from "../lib/server/chat-governor";

const {
  frontendToolsMock,
  createLanguageModelMock,
  getMissingProviderCredentialMock,
  createUIMessageStreamMock,
  createUIMessageStreamResponseMock,
  streamTextMock,
} = vi.hoisted(() => ({
  frontendToolsMock: vi.fn(),
  createLanguageModelMock: vi.fn(),
  getMissingProviderCredentialMock: vi.fn(),
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

vi.mock("@/lib/llm/provider-runtime", () => ({
  createLanguageModel: createLanguageModelMock,
  getMissingProviderCredential: getMissingProviderCredentialMock,
  getUserModelOverrides: async () => ({}),
}));

import { POST } from "../app/api/chat/route";

describe("/api/chat", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.NODES_CHAT_LIMIT_PER_MINUTE;
    delete process.env.NODES_CHAT_LIMIT_PER_HOUR;
    delete process.env.NODES_CHAT_LIMIT_CONCURRENT;
    __resetChatGovernorForTests();

    createUIMessageStreamMock.mockReturnValue("mock-ui-stream");
    createUIMessageStreamResponseMock.mockImplementation(() => new Response(null, { status: 200 }));
    frontendToolsMock.mockReturnValue({});
    createLanguageModelMock.mockImplementation((config: { provider: string; modelId: string }) => ({
      provider: config.provider,
      modelId: config.modelId,
    }));
    getMissingProviderCredentialMock.mockReturnValue(null);
    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: () => new Response("ok", { status: 200 }),
    });
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NODES_CHAT_LIMIT_PER_MINUTE;
    delete process.env.NODES_CHAT_LIMIT_PER_HOUR;
    delete process.env.NODES_CHAT_LIMIT_CONCURRENT;
    __resetChatGovernorForTests();
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
    expect(createLanguageModelMock).toHaveBeenCalledWith(
      {
        modelId: "nvidia/nemotron-3-super-120b-a12b:free",
        provider: "openrouter",
      },
      {},
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

  it("returns a classified client-safe error message from the stream layer", async () => {
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
    await expect(response.text()).resolves.toBe(
      "The assistant backend is unavailable right now. Try again in a moment.",
    );
  });

  it("retries the next allowed OpenRouter model when the selected model is unavailable", async () => {
    streamTextMock.mockImplementation(({ model }: { model: { modelId: string } }) => {
      if (model.modelId === "openrouter/free") {
        throw new Error("404 Not Found");
      }
      return {
        toUIMessageStreamResponse: ({ headers }: { headers?: HeadersInit }) =>
          new Response("ok", { status: 200, headers }),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "openrouter/free",
          messages: [{ id: "u1", role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createLanguageModelMock).toHaveBeenNthCalledWith(
      1,
      {
        modelId: "openrouter/free",
        provider: "openrouter",
      },
      {},
    );
    expect(createLanguageModelMock).toHaveBeenNthCalledWith(
      2,
      {
        modelId: "nvidia/nemotron-3-nano-30b-a3b:free",
        provider: "openrouter",
      },
      {},
    );
    expect(response.headers.get("x-nodes-model-fallback")).toBe("1");
    expect(response.headers.get("x-nodes-resolved-model")).toBe(
      "nvidia/nemotron-3-nano-30b-a3b:free",
    );
  });

  it("returns a specific configuration error when the OpenRouter key is missing", async () => {
    getMissingProviderCredentialMock.mockReturnValueOnce({
      code: "missing_openrouter_key",
      message: "OpenRouter is not configured on this deployment.",
      status: 503,
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

    expect(response.status).toBe(503);
    expect(response.headers.get("x-nodes-error-code")).toBe("missing_openrouter_key");
    await expect(response.text()).resolves.toBe("OpenRouter is not configured on this deployment.");
  });

  it("maps repeated provider rate limits to a specific client-safe response", async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error("429 Too Many Requests");
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "openrouter/free",
          messages: [{ id: "u1", role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("x-nodes-error-code")).toBe("provider_rate_limited");
    await expect(response.text()).resolves.toBe(
      "This model is rate limited right now. Try again in a moment or choose another model.",
    );
  });

  it("rejects chat requests once the per-minute quota is exhausted", async () => {
    process.env.NODES_CHAT_LIMIT_PER_MINUTE = "1";

    const first = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [{ id: "u1", role: "user", content: "hello" }],
        }),
      }),
    );

    expect(first.status).toBe(200);

    const second = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-super-120b-a12b:free",
          messages: [{ id: "u2", role: "user", content: "again" }],
        }),
      }),
    );

    expect(second.status).toBe(429);
    expect(second.headers.get("x-nodes-error-code")).toBe("chat_quota_exceeded");
    expect(second.headers.get("Retry-After")).toBeTruthy();
    await expect(second.text()).resolves.toBe(
      "You have hit the current assistant usage limit. Wait a bit before sending another request.",
    );
  });

  it("rejects overlapping requests with a specific concurrency error", async () => {
    process.env.NODES_CHAT_LIMIT_CONCURRENT = "1";

    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: ({ headers }: { headers?: HeadersInit }) =>
        new Response("ok", { status: 200, headers }),
    });

    const first = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          messages: [{ id: "u1", role: "user", content: "hello" }],
        }),
      }),
    );

    expect(first.status).toBe(200);

    const second = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          provider: "openrouter",
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          messages: [{ id: "u2", role: "user", content: "again" }],
        }),
      }),
    );

    expect(second.status).toBe(429);
    expect(second.headers.get("x-nodes-error-code")).toBe("chat_concurrency_limited");
    await expect(second.text()).resolves.toBe(
      "The assistant is still responding. Wait for it to finish or cancel the current run.",
    );
  });

  it("emits a structured audit log for successful requests", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    streamTextMock.mockReturnValue({
      toUIMessageStreamResponse: ({ headers }: { headers?: HeadersInit }) =>
        new Response("ok", { status: 200, headers }),
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

    expect(response.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      "[nodes-llm-audit]",
      expect.stringContaining("\"status\":\"accepted\""),
    );
  });
});
