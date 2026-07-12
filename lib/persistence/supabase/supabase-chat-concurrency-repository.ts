import type {
  ChatConcurrencyLeaseReservation,
  ChatConcurrencyRepository,
} from "@/lib/persistence/chat-concurrency-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { requireOwnerId } from "@/lib/persistence/supabase/shared";

type ReserveChatRunLeaseRow = {
  active_count: number;
  granted: boolean;
  retry_after_seconds: number;
};

export const supabaseChatConcurrencyRepository: ChatConcurrencyRepository = {
  async reserveLease({ concurrentLimit, expiresAt, leaseId, now, ownerId }) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client.rpc("reserve_chat_run_lease", {
      p_concurrent_limit: Math.max(1, Math.floor(concurrentLimit)),
      p_expires_at: new Date(expiresAt).toISOString(),
      p_lease_id: leaseId,
      p_now: new Date(now).toISOString(),
      p_owner_id: requireOwnerId(ownerId),
    });

    if (error) {
      throw new Error(error.message || "Failed to reserve chat run lease");
    }

    const row = Array.isArray(data)
      ? (data[0] as ReserveChatRunLeaseRow | undefined)
      : undefined;
    if (!row) {
      throw new Error("Failed to reserve chat run lease");
    }

    return {
      activeCount: Number.isFinite(row.active_count) ? row.active_count : 0,
      granted: row.granted === true,
      retryAfterSeconds: Number.isFinite(row.retry_after_seconds)
        ? Math.max(0, row.retry_after_seconds)
        : 1,
    } satisfies ChatConcurrencyLeaseReservation;
  },

  async releaseLease(ownerId, leaseId) {
    const client = getSupabasePersistenceClient();
    const { error } = await client.rpc("release_chat_run_lease", {
      p_lease_id: leaseId,
      p_owner_id: requireOwnerId(ownerId),
    });
    if (error) {
      throw new Error(error.message || "Failed to release chat run lease");
    }
  },
};
