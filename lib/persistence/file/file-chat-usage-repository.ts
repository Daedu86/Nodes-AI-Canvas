import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ChatUsageRepository,
} from "@/lib/persistence/chat-usage-repository";
import {
  createEmptyChatUsageSnapshot,
  getChatUsageRetryAfterSeconds,
  normalizeChatUsageSnapshot,
  type ChatUsageReservation,
  type ChatUsageRetryScope,
  type ChatUsageSnapshot,
} from "@/lib/chat-usage";

type StoredChatUsage = {
  createdAt: string;
  ownerId: string;
  snapshot: {
    dayCount: number;
    dayWindowStart: string;
    hourCount: number;
    hourWindowStart: string;
    minuteCount: number;
    minuteWindowStart: string;
  };
  updatedAt: string;
};

const CHAT_USAGE_FILE_EXTENSION = ".json";

export const getChatUsageStoreDir = () =>
  process.env.CHAT_USAGE_STORE_DIR
    ? path.resolve(process.env.CHAT_USAGE_STORE_DIR)
    : path.join(process.cwd(), "data", "chat-usage");

const getChatUsageFilePath = (ownerId: string) => {
  const digest = createHash("sha256").update(ownerId).digest("hex");
  return path.join(getChatUsageStoreDir(), `${digest}${CHAT_USAGE_FILE_EXTENSION}`);
};

async function ensureChatUsageStoreDir() {
  await fs.mkdir(getChatUsageStoreDir(), { recursive: true });
}

async function writeStoredUsage(entry: StoredChatUsage) {
  await ensureChatUsageStoreDir();
  const filePath = getChatUsageFilePath(entry.ownerId);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(entry, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

const toSnapshot = (
  snapshot: StoredChatUsage["snapshot"] | null | undefined,
  now: number,
): ChatUsageSnapshot => {
  if (!snapshot) {
    return createEmptyChatUsageSnapshot(now);
  }
  return normalizeChatUsageSnapshot(
    {
      dayCount: Number.isFinite(snapshot.dayCount) ? snapshot.dayCount : 0,
      dayWindowStart: Date.parse(snapshot.dayWindowStart),
      hourCount: Number.isFinite(snapshot.hourCount) ? snapshot.hourCount : 0,
      hourWindowStart: Date.parse(snapshot.hourWindowStart),
      minuteCount: Number.isFinite(snapshot.minuteCount) ? snapshot.minuteCount : 0,
      minuteWindowStart: Date.parse(snapshot.minuteWindowStart),
    },
    now,
  );
};

async function readStoredUsage(ownerId: string, now: number): Promise<StoredChatUsage | null> {
  try {
    const raw = await fs.readFile(getChatUsageFilePath(ownerId), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredChatUsage>;
    const snapshot = toSnapshot(parsed.snapshot, now);
    return {
      createdAt:
        typeof parsed.createdAt === "string" && parsed.createdAt.length > 0
          ? parsed.createdAt
          : new Date(now).toISOString(),
      ownerId,
      snapshot: {
        dayCount: snapshot.dayCount,
        dayWindowStart: new Date(snapshot.dayWindowStart).toISOString(),
        hourCount: snapshot.hourCount,
        hourWindowStart: new Date(snapshot.hourWindowStart).toISOString(),
        minuteCount: snapshot.minuteCount,
        minuteWindowStart: new Date(snapshot.minuteWindowStart).toISOString(),
      },
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date(now).toISOString(),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export const fileChatUsageRepository: ChatUsageRepository = {
  async getUsage(ownerId, now) {
    const existing = await readStoredUsage(ownerId, now);
    if (!existing) {
      return null;
    }
    return normalizeChatUsageSnapshot(
      {
        dayCount: existing.snapshot.dayCount,
        dayWindowStart: Date.parse(existing.snapshot.dayWindowStart),
        hourCount: existing.snapshot.hourCount,
        hourWindowStart: Date.parse(existing.snapshot.hourWindowStart),
        minuteCount: existing.snapshot.minuteCount,
        minuteWindowStart: Date.parse(existing.snapshot.minuteWindowStart),
      },
      now,
    );
  },

  async reserveUsage(ownerId, limits, now) {
    const existing = await readStoredUsage(ownerId, now);
    const snapshot = normalizeChatUsageSnapshot(
      existing
        ? {
            dayCount: existing.snapshot.dayCount,
            dayWindowStart: Date.parse(existing.snapshot.dayWindowStart),
            hourCount: existing.snapshot.hourCount,
            hourWindowStart: Date.parse(existing.snapshot.hourWindowStart),
            minuteCount: existing.snapshot.minuteCount,
            minuteWindowStart: Date.parse(existing.snapshot.minuteWindowStart),
          }
        : null,
      now,
    );

    let retryScope: ChatUsageRetryScope | null = null;
    if (snapshot.minuteCount >= limits.perMinute) {
      retryScope = "minute";
    } else if (snapshot.hourCount >= limits.perHour) {
      retryScope = "hour";
    } else if (snapshot.dayCount >= limits.perDay) {
      retryScope = "day";
    }

    if (retryScope) {
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

    const timestamp = new Date(now).toISOString();
    await writeStoredUsage({
      createdAt: existing?.createdAt ?? timestamp,
      ownerId,
      snapshot: {
        dayCount: nextSnapshot.dayCount,
        dayWindowStart: new Date(nextSnapshot.dayWindowStart).toISOString(),
        hourCount: nextSnapshot.hourCount,
        hourWindowStart: new Date(nextSnapshot.hourWindowStart).toISOString(),
        minuteCount: nextSnapshot.minuteCount,
        minuteWindowStart: new Date(nextSnapshot.minuteWindowStart).toISOString(),
      },
      updatedAt: timestamp,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      retryScope: null,
      snapshot: nextSnapshot,
    } satisfies ChatUsageReservation;
  },
};
