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

const validPngBytes = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const createUploadRequest = (formData: FormData) =>
  new Request("http://localhost/api/sessions/session-123/artifacts", {
    body: formData,
    headers: {
      "Content-Length": "1024",
    },
    method: "POST",
  });

describe("/api/sessions/[sessionId]/artifacts", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ id: "session-123" });
    saveSessionArtifactBlobMock.mockResolvedValue({
      blobRef: "session-123/diagram.png",
      deduplicated: false,
      storageQuotaBytes: 100 * 1024 * 1024,
      storageUsedBytes: 9,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the session does not exist", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("missing"));
    const formData = new FormData();
    formData.append(
      "file",
      new File([validPngBytes()], "diagram.png", { type: "image/png" }),
    );

    const response = await POST(
      createUploadRequest(formData),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(404);
    expect(saveSessionArtifactBlobMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    const response = await POST(
      createUploadRequest(formData),
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
      createUploadRequest(formData),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(413);
    await expect(response.text()).resolves.toContain("Artifact too large.");
    expect(saveSessionArtifactBlobMock).not.toHaveBeenCalled();
  });

  it("stores validated uploads that are under the size cap", async () => {
    const bytes = validPngBytes();
    const formData = new FormData();
    formData.append("file", new File([bytes], "diagram.png", { type: "image/png" }));

    const response = await POST(
      createUploadRequest(formData),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(200);
    expect(getSessionMock).toHaveBeenCalledWith("session-123", "test-user");
    expect(saveSessionArtifactBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: expect.any(Uint8Array),
        fileName: "diagram.png",
        mimeType: "image/png",
        ownerId: "test-user",
        sessionId: "session-123",
      }),
    );
    expect(Array.from(saveSessionArtifactBlobMock.mock.calls[0]?.[0]?.bytes ?? [])).toEqual(
      Array.from(bytes),
    );
    await expect(response.json()).resolves.toMatchObject({
      blobRef: "session-123/diagram.png",
      byteSize: bytes.byteLength,
      deduplicated: false,
      fileName: "diagram.png",
      mimeType: "image/png",
      storageQuotaBytes: 100 * 1024 * 1024,
      storageUsedBytes: bytes.byteLength,
    });
  });
});
