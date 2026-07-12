import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetArtifactUploadGovernorForTests,
  reserveArtifactUploadQuota,
  type ArtifactUploadQuotaLimits,
} from "../lib/server/artifact-upload-governor";

const ORIGINAL_BACKEND = process.env.NODES_PERSISTENCE_BACKEND;
const limits: ArtifactUploadQuotaLimits = {
  requestsPerMinute: 2,
  bytesPerMinute: 100,
  requestsPerHour: 3,
  bytesPerHour: 150,
};

describe("artifact upload governor", () => {
  beforeEach(() => {
    process.env.NODES_PERSISTENCE_BACKEND = "file";
    __resetArtifactUploadGovernorForTests();
  });

  afterEach(() => {
    __resetArtifactUploadGovernorForTests();
    if (ORIGINAL_BACKEND === undefined) {
      delete process.env.NODES_PERSISTENCE_BACKEND;
    } else {
      process.env.NODES_PERSISTENCE_BACKEND = ORIGINAL_BACKEND;
    }
  });

  it("reserves request and byte budgets atomically per user", async () => {
    const first = await reserveArtifactUploadQuota("user-a", 40, {
      limits,
      now: 1_000,
    });
    const second = await reserveArtifactUploadQuota("user-a", 50, {
      limits,
      now: 2_000,
    });
    const blocked = await reserveArtifactUploadQuota("user-a", 1, {
      limits,
      now: 3_000,
    });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(blocked).toMatchObject({
      ok: false,
      rejection: {
        code: "artifact_upload_rate_limited",
        retryAfterSeconds: 57,
        status: 429,
      },
    });
    if (blocked.ok) throw new Error("Expected a rejected upload reservation");
    expect(blocked.rejection.headers.get("Retry-After")).toBe("57");
  });

  it("keeps user budgets isolated", async () => {
    await reserveArtifactUploadQuota("user-a", 100, { limits, now: 1_000 });
    const userB = await reserveArtifactUploadQuota("user-b", 100, {
      limits,
      now: 1_000,
    });

    expect(userB).toMatchObject({ ok: true });
  });

  it("resets the minute window while preserving the hourly budget", async () => {
    await reserveArtifactUploadQuota("user-a", 60, { limits, now: 1_000 });
    const nextMinute = await reserveArtifactUploadQuota("user-a", 60, {
      limits,
      now: 61_000,
    });
    const hourlyBlocked = await reserveArtifactUploadQuota("user-a", 40, {
      limits,
      now: 62_000,
    });

    expect(nextMinute).toMatchObject({ ok: true });
    expect(hourlyBlocked).toMatchObject({ ok: false });
    if (hourlyBlocked.ok) throw new Error("Expected the hourly byte limit to reject");
    expect(hourlyBlocked.rejection.retryAfterSeconds).toBe(3_538);
  });

  it("returns remaining request and byte budgets", async () => {
    const result = await reserveArtifactUploadQuota("user-a", 40, {
      limits,
      now: 1_000,
    });

    if (!result.ok) throw new Error("Expected an accepted upload reservation");
    expect(result.headers.get("x-nodes-upload-remaining-requests-minute")).toBe("1");
    expect(result.headers.get("x-nodes-upload-remaining-bytes-minute")).toBe("60");
    expect(result.headers.get("x-nodes-upload-remaining-requests-hour")).toBe("2");
    expect(result.headers.get("x-nodes-upload-remaining-bytes-hour")).toBe("110");
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
});
