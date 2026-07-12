import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetFileChatConcurrencyForTests,
  fileChatConcurrencyRepository,
} from "../lib/persistence/file/file-chat-concurrency-repository";
import {
  __resetChatGovernorForTests,
  reserveChatQuota,
} from "../lib/server/chat-governor";

const ORIGINAL_BACKEND = process.env.NODES_PERSISTENCE_BACKEND;
const ORIGINAL_CONCURRENT_LIMIT = process.env.NODES_PLAN_FREE_CHAT_LIMIT_CONCURRENT;
const ORIGINAL_LEASE_TTL = process.env.NODES_CHAT_LEASE_TTL_SECONDS;

describe("chat concurrency leases", () => {
  beforeEach(async () => {
    process.env.NODES_PERSISTENCE_BACKEND = "file";
    process.env.NODES_PLAN_FREE_CHAT_LIMIT_CONCURRENT = "1";
    process.env.NODES_CHAT_LEASE_TTL_SECONDS = "30";
    __resetFileChatConcurrencyForTests();
    await __resetChatGovernorForTests();
  });

  afterEach(async () => {
    if (ORIGINAL_BACKEND === undefined) {
      delete process.env.NODES_PERSISTENCE_BACKEND;
    } else {
      process.env.NODES_PERSISTENCE_BACKEND = ORIGINAL_BACKEND;
    }
    if (ORIGINAL_CONCURRENT_LIMIT === undefined) {
      delete process.env.NODES_PLAN_FREE_CHAT_LIMIT_CONCURRENT;
    } else {
      process.env.NODES_PLAN_FREE_CHAT_LIMIT_CONCURRENT = ORIGINAL_CONCURRENT_LIMIT;
    }
    if (ORIGINAL_LEASE_TTL === undefined) {
      delete process.env.NODES_CHAT_LEASE_TTL_SECONDS;
    } else {
      process.env.NODES_CHAT_LEASE_TTL_SECONDS = ORIGINAL_LEASE_TTL;
    }
    await __resetChatGovernorForTests();
  });

  it("rejects a run when the distributed concurrency limit is occupied", async () => {
    const now = Date.UTC(2026, 6, 12, 10, 0, 0);
    const first = await reserveChatQuota("user-1", "free", now);
    expect(first.ok).toBe(true);

    const second = await reserveChatQuota("user-1", "free", now + 1_000);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("Expected the second reservation to be rejected");
    expect(second.rejection.code).toBe("chat_concurrency_limited");
    expect(second.rejection.headers.get("x-nodes-chat-active")).toBe("1");
    expect(second.rejection.retryAfterSeconds).toBe(29);

    if (!first.ok) throw new Error("Expected the first reservation to be granted");
    await first.grant.release();
    const third = await reserveChatQuota("user-1", "free", now + 2_000);
    expect(third.ok).toBe(true);
    if (third.ok) await third.grant.release();
  });

  it("recovers abandoned leases after their expiry", async () => {
    const now = Date.UTC(2026, 6, 12, 10, 0, 0);
    const first = await reserveChatQuota("user-2", "free", now);
    expect(first.ok).toBe(true);

    const afterExpiry = await reserveChatQuota("user-2", "free", now + 30_001);
    expect(afterExpiry.ok).toBe(true);
    if (afterExpiry.ok) await afterExpiry.grant.release();
  });

  it("treats release as idempotent", async () => {
    const now = Date.UTC(2026, 6, 12, 10, 0, 0);
    const reservation = await fileChatConcurrencyRepository.reserveLease({
      concurrentLimit: 1,
      expiresAt: now + 30_000,
      leaseId: "lease-1",
      now,
      ownerId: "user-3",
    });
    expect(reservation).toEqual({
      activeCount: 1,
      granted: true,
      retryAfterSeconds: 0,
    });

    await fileChatConcurrencyRepository.releaseLease("user-3", "lease-1");
    await fileChatConcurrencyRepository.releaseLease("user-3", "lease-1");

    const next = await fileChatConcurrencyRepository.reserveLease({
      concurrentLimit: 1,
      expiresAt: now + 30_000,
      leaseId: "lease-2",
      now,
      ownerId: "user-3",
    });
    expect(next.granted).toBe(true);
  });
});
