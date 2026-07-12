import { getPersistenceBackend } from "@/lib/persistence/backend";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";

export type ArtifactUploadQuotaLimits = {
  bytesPerHour: number;
  bytesPerMinute: number;
  requestsPerHour: number;
  requestsPerMinute: number;
};

type ArtifactUploadUsageSnapshot = {
  hourBytes: number;
  hourCount: number;
  minuteBytes: number;
  minuteCount: number;
};

type LocalArtifactUploadUsageState = ArtifactUploadUsageSnapshot & {
  hourWindowStart: number;
  minuteWindowStart: number;
  updatedAt: number;
};

export type ArtifactUploadQuotaResult =
  | {
      ok: true;
      headers: Headers;
      snapshot: ArtifactUploadUsageSnapshot;
    }
  | {
      ok: false;
      rejection: {
        code: "artifact_upload_rate_limited";
        headers: Headers;
        message: string;
        retryAfterSeconds: number;
        status: 429;
      };
    };

const DEFAULT_LIMITS: ArtifactUploadQuotaLimits = {
  requestsPerMinute: 12,
  bytesPerMinute: 48 * 1024 * 1024,
  requestsPerHour: 120,
  bytesPerHour: 512 * 1024 * 1024,
};

const parsePositiveLimit = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getArtifactUploadQuotaLimits = (): ArtifactUploadQuotaLimits => ({
  requestsPerMinute: parsePositiveLimit(
    process.env.NODES_UPLOAD_REQUESTS_PER_MINUTE,
    DEFAULT_LIMITS.requestsPerMinute,
  ),
  bytesPerMinute: parsePositiveLimit(
    process.env.NODES_UPLOAD_BYTES_PER_MINUTE,
    DEFAULT_LIMITS.bytesPerMinute,
  ),
  requestsPerHour: parsePositiveLimit(
    process.env.NODES_UPLOAD_REQUESTS_PER_HOUR,
    DEFAULT_LIMITS.requestsPerHour,
  ),
  bytesPerHour: parsePositiveLimit(
    process.env.NODES_UPLOAD_BYTES_PER_HOUR,
    DEFAULT_LIMITS.bytesPerHour,
  ),
});

const getLocalUsageStore = () => {
  const globalState = globalThis as typeof globalThis & {
    __nodesArtifactUploadUsage?: Map<string, LocalArtifactUploadUsageState>;
  };
  globalState.__nodesArtifactUploadUsage ??= new Map();
  return globalState.__nodesArtifactUploadUsage;
};

const getWindowStart = (now: number, windowMs: number) =>
  Math.floor(now / windowMs) * windowMs;

const getRetryAfterSeconds = (
  now: number,
  state: LocalArtifactUploadUsageState,
  minuteBlocked: boolean,
  hourBlocked: boolean,
) => {
  const minuteRetry = minuteBlocked
    ? Math.ceil((state.minuteWindowStart + 60_000 - now) / 1_000)
    : 0;
  const hourRetry = hourBlocked
    ? Math.ceil((state.hourWindowStart + 3_600_000 - now) / 1_000)
    : 0;
  return Math.max(1, minuteRetry, hourRetry);
};

const reserveLocalUsage = (
  ownerId: string,
  requestBytes: number,
  limits: ArtifactUploadQuotaLimits,
  now: number,
) => {
  const store = getLocalUsageStore();
  for (const [key, value] of store) {
    if (now - value.updatedAt > 2 * 3_600_000) store.delete(key);
  }

  const minuteWindowStart = getWindowStart(now, 60_000);
  const hourWindowStart = getWindowStart(now, 3_600_000);
  const current = store.get(ownerId);
  const state: LocalArtifactUploadUsageState = {
    minuteWindowStart,
    minuteCount:
      current?.minuteWindowStart === minuteWindowStart ? current.minuteCount : 0,
    minuteBytes:
      current?.minuteWindowStart === minuteWindowStart ? current.minuteBytes : 0,
    hourWindowStart,
    hourCount: current?.hourWindowStart === hourWindowStart ? current.hourCount : 0,
    hourBytes: current?.hourWindowStart === hourWindowStart ? current.hourBytes : 0,
    updatedAt: now,
  };

  const minuteBlocked =
    state.minuteCount + 1 > limits.requestsPerMinute ||
    state.minuteBytes + requestBytes > limits.bytesPerMinute;
  const hourBlocked =
    state.hourCount + 1 > limits.requestsPerHour ||
    state.hourBytes + requestBytes > limits.bytesPerHour;

  if (!minuteBlocked && !hourBlocked) {
    state.minuteCount += 1;
    state.minuteBytes += requestBytes;
    state.hourCount += 1;
    state.hourBytes += requestBytes;
  }
  store.set(ownerId, state);

  return {
    allowed: !minuteBlocked && !hourBlocked,
    retryAfterSeconds: minuteBlocked || hourBlocked
      ? getRetryAfterSeconds(now, state, minuteBlocked, hourBlocked)
      : 0,
    snapshot: {
      minuteCount: state.minuteCount,
      minuteBytes: state.minuteBytes,
      hourCount: state.hourCount,
      hourBytes: state.hourBytes,
    },
  };
};

const reserveSupabaseUsage = async (
  ownerId: string,
  requestBytes: number,
  limits: ArtifactUploadQuotaLimits,
  now: number,
) => {
  const client = getSupabasePersistenceClient();
  const { data, error } = await client.rpc("reserve_artifact_upload_usage", {
    p_hour_byte_limit: limits.bytesPerHour,
    p_hour_request_limit: limits.requestsPerHour,
    p_minute_byte_limit: limits.bytesPerMinute,
    p_minute_request_limit: limits.requestsPerMinute,
    p_now: new Date(now).toISOString(),
    p_owner_id: ownerId,
    p_request_bytes: requestBytes,
  });
  if (error) {
    throw new Error(error.message || "Failed to reserve artifact upload usage");
  }
  const row = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : undefined;
  if (!row) {
    throw new Error("Artifact upload usage reservation returned no result");
  }
  return {
    allowed: row.allowed === true,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds ?? 0)),
    snapshot: {
      minuteCount: Math.max(0, Number(row.minute_count ?? 0)),
      minuteBytes: Math.max(0, Number(row.minute_bytes ?? 0)),
      hourCount: Math.max(0, Number(row.hour_count ?? 0)),
      hourBytes: Math.max(0, Number(row.hour_bytes ?? 0)),
    },
  };
};

const getRemaining = (limit: number, used: number) => Math.max(0, limit - used);

const buildHeaders = (
  limits: ArtifactUploadQuotaLimits,
  snapshot: ArtifactUploadUsageSnapshot,
) => {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("x-nodes-upload-limit-requests-minute", String(limits.requestsPerMinute));
  headers.set(
    "x-nodes-upload-remaining-requests-minute",
    String(getRemaining(limits.requestsPerMinute, snapshot.minuteCount)),
  );
  headers.set("x-nodes-upload-limit-bytes-minute", String(limits.bytesPerMinute));
  headers.set(
    "x-nodes-upload-remaining-bytes-minute",
    String(getRemaining(limits.bytesPerMinute, snapshot.minuteBytes)),
  );
  headers.set("x-nodes-upload-limit-requests-hour", String(limits.requestsPerHour));
  headers.set(
    "x-nodes-upload-remaining-requests-hour",
    String(getRemaining(limits.requestsPerHour, snapshot.hourCount)),
  );
  headers.set("x-nodes-upload-limit-bytes-hour", String(limits.bytesPerHour));
  headers.set(
    "x-nodes-upload-remaining-bytes-hour",
    String(getRemaining(limits.bytesPerHour, snapshot.hourBytes)),
  );
  return headers;
};

export async function reserveArtifactUploadQuota(
  ownerId: string,
  requestBytes: number,
  options: {
    limits?: ArtifactUploadQuotaLimits;
    now?: number;
  } = {},
): Promise<ArtifactUploadQuotaResult> {
  if (!ownerId.trim()) throw new Error("An upload owner id is required");
  if (!Number.isSafeInteger(requestBytes) || requestBytes < 1) {
    throw new Error("Artifact upload request bytes must be a positive integer");
  }

  const limits = options.limits ?? getArtifactUploadQuotaLimits();
  const now = options.now ?? Date.now();
  const reservation = getPersistenceBackend() === "supabase"
    ? await reserveSupabaseUsage(ownerId, requestBytes, limits, now)
    : reserveLocalUsage(ownerId, requestBytes, limits, now);
  const headers = buildHeaders(limits, reservation.snapshot);

  if (!reservation.allowed) {
    headers.set("Retry-After", String(reservation.retryAfterSeconds));
    return {
      ok: false,
      rejection: {
        code: "artifact_upload_rate_limited",
        headers,
        message: "Artifact upload rate limit exceeded. Try again after the retry window.",
        retryAfterSeconds: reservation.retryAfterSeconds,
        status: 429,
      },
    };
  }

  return { ok: true, headers, snapshot: reservation.snapshot };
}

export function __resetArtifactUploadGovernorForTests() {
  getLocalUsageStore().clear();
}
