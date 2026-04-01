import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupSessionBlobStoreMock,
  getSessionBlobMaintenanceSummaryMock,
} = vi.hoisted(() => ({
  cleanupSessionBlobStoreMock: vi.fn(),
  getSessionBlobMaintenanceSummaryMock: vi.fn(),
}));

vi.mock("@/lib/session-store", () => ({
  cleanupSessionBlobStore: cleanupSessionBlobStoreMock,
  getSessionBlobMaintenanceSummary: getSessionBlobMaintenanceSummaryMock,
}));

import { GET, POST } from "../app/api/sessions/blob-maintenance/route";

describe("/api/sessions/blob-maintenance", () => {
  beforeEach(() => {
    getSessionBlobMaintenanceSummaryMock.mockResolvedValue({
      deduplicatedBlobLinks: 1,
      orphanBlobCount: 2,
      orphanBytes: 2048,
      referencedBlobCount: 3,
      referencedBlobLinks: 4,
      referencedBytes: 4096,
      totalBlobCount: 5,
      totalBytes: 6144,
      uniqueReferencedBlobCount: 3,
    });
    cleanupSessionBlobStoreMock.mockResolvedValue({
      deletedBlobCount: 2,
      deletedBytes: 2048,
      maintenance: {
        deduplicatedBlobLinks: 1,
        orphanBlobCount: 0,
        orphanBytes: 0,
        referencedBlobCount: 3,
        referencedBlobLinks: 4,
        referencedBytes: 4096,
        totalBlobCount: 3,
        totalBytes: 4096,
        uniqueReferencedBlobCount: 3,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns blob maintenance summary", async () => {
    const response = await GET(new Request("http://localhost/api/sessions/blob-maintenance"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      maintenance: {
        orphanBlobCount: 2,
        totalBlobCount: 5,
      },
    });
  });

  it("runs orphan cleanup", async () => {
    const response = await POST(
      new Request("http://localhost/api/sessions/blob-maintenance", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cleanup: {
        deletedBlobCount: 2,
        maintenance: {
          orphanBlobCount: 0,
        },
      },
    });
  });

  it("blocks remote cleanup requests", async () => {
    const response = await POST(
      new Request("https://example.com/api/sessions/blob-maintenance", { method: "POST" }),
    );

    expect(response.status).toBe(403);
    expect(cleanupSessionBlobStoreMock).not.toHaveBeenCalled();
  });
});
