import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveSessionArtifactBlobMock } = vi.hoisted(() => ({
  saveSessionArtifactBlobMock: vi.fn(),
}));

vi.mock("@/lib/session-blob-store", () => ({
  saveSessionArtifactBlob: saveSessionArtifactBlobMock,
}));

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/session-store", () => ({
  getSession: getSessionMock,
}));

import { POST } from "../app/api/sessions/[sessionId]/artifacts/route";

describe("/api/sessions/[sessionId]/artifacts", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({
      id: "session-123",
    });
    saveSessionArtifactBlobMock.mockResolvedValue({
      absolutePath: "C:\\temp\\blob",
      blobRef: "session-123/diagram.png",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the session does not exist", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("missing"));
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1])], "diagram.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/sessions/session-123/artifacts", {
        body: formData,
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(404);
    expect(saveSessionArtifactBlobMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    const response = await POST(
      new Request("http://localhost/api/sessions/session-123/artifacts", {
        body: formData,
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(400);
    expect(saveSessionArtifactBlobMock).not.toHaveBeenCalled();
  });

  it("rejects oversized image uploads with 413", async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.append("file", new File([bytes], "diagram.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/sessions/session-123/artifacts", {
        body: formData,
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toContain("Artifact too large.");
    expect(saveSessionArtifactBlobMock).not.toHaveBeenCalled();
  });

  it("stores uploads that are under the size cap", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.append("file", new File([bytes], "diagram.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/sessions/session-123/artifacts", {
        body: formData,
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(200);
    expect(getSessionMock).toHaveBeenCalledWith("session-123", "test-user");
    expect(saveSessionArtifactBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "diagram.png",
        sessionId: "session-123",
      }),
    );
    expect(saveSessionArtifactBlobMock.mock.calls[0]?.[0]?.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(saveSessionArtifactBlobMock.mock.calls[0]?.[0]?.bytes ?? [])).toEqual([
      1,
      2,
      3,
      4,
    ]);
    await expect(response.json()).resolves.toMatchObject({
      blobRef: "session-123/diagram.png",
      byteSize: 4,
      fileName: "diagram.png",
      mimeType: "image/png",
    });
  });
});
