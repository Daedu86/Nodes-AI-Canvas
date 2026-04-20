import type { ChatUsageRepository } from "@/lib/persistence/chat-usage-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import {
  normalizeChatUsageSnapshot,
  type ChatUsageReservation,
  type ChatUsageRetryScope,
} from "@/lib/chat-usage";
import { requireOwnerId } from "@/lib/persistence/supabase/shared";

type ReserveChatUsageRow = {
  allowed: boolean;
  day_count: number;
  day_window_start: string;
  hour_count: number;
  hour_window_start: string;
  minute_count: number;
  minute_window_start: string;
  retry_after_seconds: number;
  retry_scope: ChatUsageRetryScope | null;
};

export const supabaseChatUsageRepository: ChatUsageRepository = {
  async getUsage(ownerId, now) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("chat_usage_state")
      .select(
        "owner_id,minute_window_start,minute_count,hour_window_start,hour_count,day_window_start,day_count",
      )
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load chat usage");
    }
    if (!data) {
      return null;
    }

    const row = data as Omit<ReserveChatUsageRow, "allowed" | "retry_after_seconds" | "retry_scope">;
    return normalizeChatUsageSnapshot(
      {
        dayCount: row.day_count,
        dayWindowStart: Date.parse(row.day_window_start),
        hourCount: row.hour_count,
        hourWindowStart: Date.parse(row.hour_window_start),
        minuteCount: row.minute_count,
        minuteWindowStart: Date.parse(row.minute_window_start),
      },
      now,
    );
  },

  async reserveUsage(ownerId, limits, now) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("reserve_chat_usage", {
      p_day_limit: limits.perDay,
      p_hour_limit: limits.perHour,
      p_minute_limit: limits.perMinute,
      p_now: new Date(now).toISOString(),
      p_owner_id: requireOwnerId(ownerId),
    });

    if (error) {
      throw new Error(error.message || "Failed to reserve chat usage");
    }

    const row = Array.isArray(data) ? (data[0] as ReserveChatUsageRow | undefined) : undefined;
    if (!row) {
      throw new Error("Failed to reserve chat usage");
    }

    return {
      allowed: row.allowed,
      retryAfterSeconds: Number.isFinite(row.retry_after_seconds) ? row.retry_after_seconds : 1,
      retryScope:
        row.retry_scope === "minute" || row.retry_scope === "hour" || row.retry_scope === "day"
          ? row.retry_scope
          : null,
      snapshot: normalizeChatUsageSnapshot(
        {
          dayCount: row.day_count,
          dayWindowStart: Date.parse(row.day_window_start),
          hourCount: row.hour_count,
          hourWindowStart: Date.parse(row.hour_window_start),
          minuteCount: row.minute_count,
          minuteWindowStart: Date.parse(row.minute_window_start),
        },
        now,
      ),
    } satisfies ChatUsageReservation;
  },
};
