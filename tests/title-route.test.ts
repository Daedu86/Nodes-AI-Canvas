import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { POST } from "../app/api/title/route";

describe("/api/title", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Mock Browser Title" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    fetchMock.mockReset();
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
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      messages: Array<{ role: string; content: string }>;
    };
    const prompt = body.messages[0]?.content ?? "";

    expect(prompt).toContain("[image: image/png]");
    expect(prompt).toContain("[file: brief.pdf]");
    expect(prompt).toContain("[tool result: searchDocs]");

    expect(await response.json()).toEqual({ title: "Mock Browser Title" });
  });
});
