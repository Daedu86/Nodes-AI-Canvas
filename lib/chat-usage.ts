export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type ChatUsageRetryScope = "day" | "hour" | "minute";

export type ChatUsageLimits = {
  perDay: number;
  perHour: number;
  perMinute: number;
};

export type ChatUsageSnapshot = {
  dayCount: number;
  dayWindowStart: number;
  hourCount: number;
  hourWindowStart: number;
  minuteCount: number;
  minuteWindowStart: number;
};

export type ChatUsageReservation = {
  allowed: boolean;
  retryAfterSeconds: number;
  retryScope: ChatUsageRetryScope | null;
  snapshot: ChatUsageSnapshot;
};

export const getChatUsageWindowStarts = (now: number) => {
  const current = new Date(now);
  return {
    dayWindowStart: Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
    ),
    hourWindowStart: Math.floor(now / HOUR) * HOUR,
    minuteWindowStart: Math.floor(now / MINUTE) * MINUTE,
  };
};

export const createEmptyChatUsageSnapshot = (now: number): ChatUsageSnapshot => {
  const windows = getChatUsageWindowStarts(now);
  return {
    dayCount: 0,
    dayWindowStart: windows.dayWindowStart,
    hourCount: 0,
    hourWindowStart: windows.hourWindowStart,
    minuteCount: 0,
    minuteWindowStart: windows.minuteWindowStart,
  };
};

export const normalizeChatUsageSnapshot = (
  snapshot: ChatUsageSnapshot | null | undefined,
  now: number,
): ChatUsageSnapshot => {
  const fallback = createEmptyChatUsageSnapshot(now);
  const base = snapshot
    ? {
        dayCount: Number.isFinite(snapshot.dayCount) && snapshot.dayCount >= 0 ? snapshot.dayCount : 0,
        dayWindowStart:
          Number.isFinite(snapshot.dayWindowStart) && snapshot.dayWindowStart > 0
            ? snapshot.dayWindowStart
            : fallback.dayWindowStart,
        hourCount:
          Number.isFinite(snapshot.hourCount) && snapshot.hourCount >= 0 ? snapshot.hourCount : 0,
        hourWindowStart:
          Number.isFinite(snapshot.hourWindowStart) && snapshot.hourWindowStart > 0
            ? snapshot.hourWindowStart
            : fallback.hourWindowStart,
        minuteCount:
          Number.isFinite(snapshot.minuteCount) && snapshot.minuteCount >= 0
            ? snapshot.minuteCount
            : 0,
        minuteWindowStart:
          Number.isFinite(snapshot.minuteWindowStart) && snapshot.minuteWindowStart > 0
            ? snapshot.minuteWindowStart
            : fallback.minuteWindowStart,
      }
    : fallback;
  const windows = getChatUsageWindowStarts(now);
  return {
    dayCount: base.dayWindowStart < windows.dayWindowStart ? 0 : base.dayCount,
    dayWindowStart:
      base.dayWindowStart < windows.dayWindowStart ? windows.dayWindowStart : base.dayWindowStart,
    hourCount: base.hourWindowStart < windows.hourWindowStart ? 0 : base.hourCount,
    hourWindowStart:
      base.hourWindowStart < windows.hourWindowStart
        ? windows.hourWindowStart
        : base.hourWindowStart,
    minuteCount: base.minuteWindowStart < windows.minuteWindowStart ? 0 : base.minuteCount,
    minuteWindowStart:
      base.minuteWindowStart < windows.minuteWindowStart
        ? windows.minuteWindowStart
        : base.minuteWindowStart,
  };
};

export const getChatUsageRetryAfterSeconds = (
  snapshot: ChatUsageSnapshot,
  now: number,
  scope: ChatUsageRetryScope,
) => {
  const retryAt =
    scope === "minute"
      ? snapshot.minuteWindowStart + MINUTE
      : scope === "hour"
        ? snapshot.hourWindowStart + HOUR
        : snapshot.dayWindowStart + DAY;
  return Math.max(1, Math.ceil((retryAt - now) / SECOND));
};
