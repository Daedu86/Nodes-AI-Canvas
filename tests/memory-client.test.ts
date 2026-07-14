import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryItem,
  deleteMemoryItem,
  fetchMemoryItems,
} from "@/lib/client/memory-client";

const memoryItem = {
  content: "Decision content",
  createdAt: "2026-07-14T00:00:00.000Z",
  id: "memory-1",
  sourceProjectId: null,
  sourceKeys: [],
  sourceKind: null,
  sourceSessionId: null,
  title: "Decision",
  type: "decision" as const,
  updatedAt: "2026-07-14T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("memory client", () => {
  it("loads and normalizes memory items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [memoryItem] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMemoryItems()).resolves.toEqual([memoryItem]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });

  it("creates one memory item through the shared JSON client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ item: memoryItem }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createMemoryItem({
        content: memoryItem.content,
        title: memoryItem.title,
        type: memoryItem.type,
      }),
    ).resolves.toEqual(memoryItem);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("accepts an already deleted memory item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteMemoryItem("memory/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory/memory%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rejects malformed list payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [{ id: "broken" }] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(fetchMemoryItems()).rejects.toThrow("Invalid memory item response.");
  });
});
