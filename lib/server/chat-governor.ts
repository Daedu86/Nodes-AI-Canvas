import { randomUUID } from "node:crypto";
import {
  reservePersistentChatUsage,
  __resetChatUsageStoreForTests,
} from "@/lib/chat-usage-store";
import {
  createEmptyChatUsageSnapshot,
  type ChatUsageSnapshot,
} from "@/lib/chat-usage";
import { __resetFileChatConcurrencyForTests } from "@/lib/persistence/file/file-chat-concurrency-repository";
import { getChatConcurrencyRepository } from "@/lib/persistence/repositories";
import type { LlmQuotaMetrics } from "@/lib/server/llm-audit";
import {
  getChatQuotaLimits,
  type ChatQuotaLimits,
  type UserPlan,
} from "@/lib/user-plan";

export type ChatQuotaGrant = {
  headers: Headers;
  metrics: LlmQuotaMetrics;
  release: () => Promise<void>;
};

export type ChatQuotaRejection = {
  code: "chat_concurrency_limited" | "chat_quota_exceeded";
  headers: Headers;
  message: string;
  metrics: LlmQuotaMetrics;
  retryAfterSeconds: number;
  status: 429;
};

export type ChatQuotaResult =
  | { ok: true; grant: ChatQuotaGrant }
  | { ok: false; rejection: ChatQuotaRejection };

const DEFAULT_CHAT_LEASE_TTL_SECONDS = 120;
const MIN_CHAT_LEASE_TTL_SECONDS = 30;
const MAX_CHAT_LEASE_TTL_SECONDS = 600;

const getChatLeaseTtlMs = () => {
  const configured = Number(process.env.NODES_CHAT_LEASE_TTL_SECONDS);
  const seconds = Number.isFinite(configured)
    ? Math.floor(configured)
    : DEFAULT_CHAT_LEASE_TTL_SECONDS;
  return (
    Math.min(
      MAX_CHAT_LEASE_TTL_SECONDS,
      Math.max(MIN_CHAT_LEASE_TTL_SECONDS, seconds),
    ) * 1_000
  );
};

const getRemaining = (limit: number, used: number) =>
  Math.max(0, limit - used);

const buildHeaders = ({
  active,
  limits,
  snapshot,
}: {
  active: number;
  limits: ChatQuotaLimits;
  snapshot: ChatUsageSnapshot;
}) => {
  const headers = new Headers();
  headers.set("x-nodes-chat-limit-minute", String(limits.perMinute));
  headers.set(
    "x-nodes-chat-remaining-minute",
    String(getRemaining(limits.perMinute, snapshot.minuteCount)),
  );
  headers.set("x-nodes-chat-limit-hour", String(limits.perHour));
  headers.set(
    "x-nodes-chat-remaining-hour",
    String(getRemaining(limits.perHour, snapshot.hourCount)),
  );
  headers.set("x-nodes-chat-limit-day", String(limits.perDay));
  headers.set(
    "x-nodes-chat-remaining-day",
    String(getRemaining(limits.perDay, snapshot.dayCount)),
  );
  headers.set("x-nodes-chat-limit-concurrent", String(limits.concurrent));
  headers.set("x-nodes-chat-active", String(active));
  headers.set("x-nodes-user-plan", limits.plan);
  return headers;
};

const buildMetrics = ({
  active,
  limits,
  reservationStartedAt,
  retryAfterSeconds = null,
  snapshot,
}: {
  active: number;
  limits: ChatQuotaLimits;
  reservationStartedAt: number;
  retryAfterSeconds?: number | null;
  snapshot: ChatUsageSnapshot;
}): LlmQuotaMetrics => ({
  active,
  concurrentLimit: limits.concurrent,
  plan: limits.plan,
  remainingDay: getRemaining(limits.perDay, snapshot.dayCount),
  remainingHour: getRemaining(limits.perHour, snapshot.hourCount),
  remainingMinute: getRemaining(limits.perMinute, snapshot.minuteCount),
  reservationMs: Math.max(0, Date.now() - reservationStartedAt),
  retryAfterSeconds,
});

const releaseLeaseSafely = async (ownerId: string, leaseId: string) => {
  try {
    await getChatConcurrencyRepository().releaseLease(ownerId, leaseId);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(
      JSON.stringify({
        errorName,
        event: "chat_lease_release_failed",
        leaseId,
        source: "nodes-chat-governor",
      }),
    );
  }
};

export async function reserveChatQuota(
  userId: string,
  userPlan: UserPlan,
  now = Date.now(),
): Promise<ChatQuotaResult> {
  const reservationStartedAt = Date.now();
  const limits = getChatQuotaLimits(userPlan);
  const leaseId = randomUUID();
  const concurrency = await getChatConcurrencyRepository().reserveLease({
    concurrentLimit: limits.concurrent,
    expiresAt: now + getChatLeaseTtlMs(),
    leaseId,
    now,
    ownerId: userId,
  });

  if (!concurrency.granted) {
    const snapshot = createEmptyChatUsageSnapshot(now);
    const headers = buildHeaders({
      active: concurrency.activeCount,
      limits,
      snapshot,
    });
    headers.set("Retry-After", String(concurrency.retryAfterSeconds));
    return {
      ok: false,
      rejection: {
        code: "chat_concurrency_limited",
        headers,
        message:
          "The assistant is still responding. Wait for it to finish or cancel the current run.",
        metrics: buildMetrics({
          active: concurrency.activeCount,
          limits,
          reservationStartedAt,
          retryAfterSeconds: concurrency.retryAfterSeconds,
          snapshot,
        }),
        retryAfterSeconds: concurrency.retryAfterSeconds,
        status: 429,
      },
    };
  }

  let usage;
  try {
    usage = await reservePersistentChatUsage(
      userId,
      {
        perDay: limits.perDay,
        perHour: limits.perHour,
        perMinute: limits.perMinute,
      },
      now,
    );
  } catch (error) {
    await releaseLeaseSafely(userId, leaseId);
    throw error;
  }

  if (!usage.allowed) {
    await releaseLeaseSafely(userId, leaseId);
    const active = Math.max(0, concurrency.activeCount - 1);
    const headers = buildHeaders({
      active,
      limits,
      snapshot: usage.snapshot,
    });
    headers.set("Retry-After", String(usage.retryAfterSeconds));
    return {
      ok: false,
      rejection: {
        code: "chat_quota_exceeded",
        headers,
        message:
          "You have hit the current assistant usage limit. Wait a bit before sending another request.",
        metrics: buildMetrics({
          active,
          limits,
          reservationStartedAt,
          retryAfterSeconds: usage.retryAfterSeconds,
          snapshot: usage.snapshot,
        }),
        retryAfterSeconds: usage.retryAfterSeconds,
        status: 429,
      },
    };
  }

  let releasePromise: Promise<void> | null = null;
  return {
    ok: true,
    grant: {
      headers: buildHeaders({
        active: concurrency.activeCount,
        limits,
        snapshot: usage.snapshot,
      }),
      metrics: buildMetrics({
        active: concurrency.activeCount,
        limits,
        reservationStartedAt,
        snapshot: usage.snapshot,
      }),
      release: () => {
        releasePromise ??= releaseLeaseSafely(userId, leaseId);
        return releasePromise;
      },
    },
  };
}

export async function __resetChatGovernorForTests() {
  __resetFileChatConcurrencyForTests();
  await __resetChatUsageStoreForTests();
}
