import { promises as fs } from "node:fs";
import { getPersistenceBackend } from "@/lib/persistence/backend";
import { getChatUsageRepository } from "@/lib/persistence/repositories";
import { getChatUsageStoreDir } from "@/lib/persistence/file/file-chat-usage-repository";
import {
  getChatUsageRetryAfterSeconds,
  normalizeChatUsageSnapshot,
  type ChatUsageLimits,
  type ChatUsageReservation,
  type ChatUsageRetryScope,
  type ChatUsageSnapshot,
} from "@/lib/chat-usage";

const isMissingChatUsageStorageError = (error: unknown) =>
  error instanceof Error &&
  /(chat_usage_state|reserve_chat_usage)/i.test(error.message) &&
  /(schema cache|could not find the table|function|relation|does not exist)/i.test(error.message);

const getFallbackUsageStore = () => {
  const globalState = globalThis as typeof globalThis & {
    __nodesChatUsageStore?: Map<string, ChatUsageSnapshot>;
  };
  if (!globalState.__nodesChatUsageStore) {
    globalState.__nodesChatUsageStore = new Map();
  }
  return globalState.__nodesChatUsageStore;
};

const reserveFromMemory = (
  ownerId: string,
  limits: ChatUsageLimits,
  now: number,
): ChatUsageReservation => {
  const store = getFallbackUsageStore();
  const snapshot = normalizeChatUsageSnapshot(store.get(ownerId), now);

  let retryScope: ChatUsageRetryScope | null = null;
  if (snapshot.minuteCount >= limits.perMinute) {
    retryScope = "minute";
  } else if (snapshot.hourCount >= limits.perHour) {
    retryScope = "hour";
  } else if (snapshot.dayCount >= limits.perDay) {
    retryScope = "day";
  }

  if (retryScope) {
    store.set(ownerId, snapshot);
    return {
      allowed: false,
      retryAfterSeconds: getChatUsageRetryAfterSeconds(snapshot, now, retryScope),
      retryScope,
      snapshot,
    };
  }

  const nextSnapshot: ChatUsageSnapshot = {
    dayCount: snapshot.dayCount + 1,
    dayWindowStart: snapshot.dayWindowStart,
    hourCount: snapshot.hourCount + 1,
    hourWindowStart: snapshot.hourWindowStart,
    minuteCount: snapshot.minuteCount + 1,
    minuteWindowStart: snapshot.minuteWindowStart,
  };
  store.set(ownerId, nextSnapshot);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    retryScope: null,
    snapshot: nextSnapshot,
  };
};

export async function getPersistentChatUsageSnapshot(ownerId: string, now = Date.now()) {
  if (process.env.NODE_ENV === "test" && getPersistenceBackend() === "file") {
    return normalizeChatUsageSnapshot(getFallbackUsageStore().get(ownerId), now);
  }
  try {
    const stored = await getChatUsageRepository().getUsage(ownerId, now);
    return normalizeChatUsageSnapshot(stored, now);
  } catch (error) {
    if (isMissingChatUsageStorageError(error)) {
      return normalizeChatUsageSnapshot(getFallbackUsageStore().get(ownerId), now);
    }
    throw error;
  }
}

export async function reservePersistentChatUsage(
  ownerId: string,
  limits: ChatUsageLimits,
  now = Date.now(),
): Promise<ChatUsageReservation> {
  if (process.env.NODE_ENV === "test" && getPersistenceBackend() === "file") {
    return reserveFromMemory(ownerId, limits, now);
  }
  try {
    return await getChatUsageRepository().reserveUsage(ownerId, limits, now);
  } catch (error) {
    if (isMissingChatUsageStorageError(error)) {
      return reserveFromMemory(ownerId, limits, now);
    }
    throw error;
  }
}

export async function __resetChatUsageStoreForTests() {
  getFallbackUsageStore().clear();
  if (getPersistenceBackend() === "file") {
    await fs.rm(getChatUsageStoreDir(), { force: true, recursive: true }).catch(() => undefined);
  }
}
