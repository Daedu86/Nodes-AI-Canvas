import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "../app/api/llm/control/route";

describe("/api/llm/control", () => {
  beforeEach(() => {
    delete process.env.ENABLE_OLLAMA_CONTROL_ROUTE;
    delete process.env.OLLAMA_CMD;
    fetchMock.mockReset();
    execFileMock.mockReset();
  });

  afterEach(() => {
    delete process.env.ENABLE_OLLAMA_CONTROL_ROUTE;
    delete process.env.OLLAMA_CMD;
  });

  it("is disabled by default in the cloud-first app flow", async () => {
    const response = await POST(
      new Request("http://localhost/api/llm/control", {
        method: "POST",
        body: JSON.stringify({ action: "start", model: "gemma3:4b" }),
      }) as never,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error:
        "Ollama control route is disabled. Set ENABLE_OLLAMA_CONTROL_ROUTE=1 to enable local model lifecycle controls.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("blocks remote callers even when enabled", async () => {
    process.env.ENABLE_OLLAMA_CONTROL_ROUTE = "1";

    const response = await POST(
      new Request("https://example.com/api/llm/control", {
        method: "POST",
        body: JSON.stringify({ action: "start", model: "gemma3:4b" }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("can warm a model when explicitly enabled", async () => {
    process.env.ENABLE_OLLAMA_CONTROL_ROUTE = "1";
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const response = await POST(
      new Request("http://localhost/api/llm/control", {
        method: "POST",
        body: JSON.stringify({ action: "start", model: "gemma3:4b" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "started",
      model: "gemma3:4b",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("can stop a model when explicitly enabled", async () => {
    process.env.ENABLE_OLLAMA_CONTROL_ROUTE = "1";
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: { timeout: number },
        callback: (error: Error | null) => void,
      ) => {
        callback(null);
      },
    );

    const response = await POST(
      new Request("http://localhost/api/llm/control", {
        method: "POST",
        body: JSON.stringify({ action: "stop", model: "gemma3:4b" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "stopped",
      model: "gemma3:4b",
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "ollama",
      ["stop", "gemma3:4b"],
      { timeout: 30000 },
      expect.any(Function),
    );
  });

  it("returns a generic stop error instead of raw command output", async () => {
    process.env.ENABLE_OLLAMA_CONTROL_ROUTE = "1";
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: { timeout: number },
        callback: (error: Error | null) => void,
      ) => {
        callback(new Error("spawn ENOENT ollama"));
      },
    );

    const response = await POST(
      new Request("http://localhost/api/llm/control", {
        method: "POST",
        body: JSON.stringify({ action: "stop", model: "gemma3:4b" }),
      }) as never,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Unable to stop the Ollama model.",
    });
  });
});
