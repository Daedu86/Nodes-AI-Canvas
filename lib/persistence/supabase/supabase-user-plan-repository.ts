import type { UserPlanRepository } from "@/lib/persistence/user-plan-repository";
import { getSupabasePersistenceClient } from "@/lib/persistence/supabase/client";
import { ensureData, requireOwnerId } from "@/lib/persistence/supabase/shared";
import {
  normalizeUserPlan,
  type UserPlanRecord,
} from "@/lib/user-plan";

type UserPlanRow = {
  created_at: string;
  owner_id: string;
  plan: string;
  updated_at: string;
};

const toUserPlanRecord = (row: UserPlanRow): UserPlanRecord => ({
  createdAt: row.created_at,
  ownerId: row.owner_id,
  plan: normalizeUserPlan(row.plan),
  updatedAt: row.updated_at,
});

export const supabaseUserPlanRepository: UserPlanRepository = {
  async getPlan(ownerId) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("user_plans")
      .select("owner_id,plan,created_at,updated_at")
      .eq("owner_id", requireOwnerId(ownerId))
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load user plan");
    }
    if (!data) {
      return null;
    }
    return toUserPlanRecord(data as UserPlanRow);
  },

  async savePlan(ownerId, plan) {
    const client = getSupabasePersistenceClient();
    const { data, error } = await client
      .from("user_plans")
      .upsert(
        {
          owner_id: requireOwnerId(ownerId),
          plan: normalizeUserPlan(plan),
        },
        { onConflict: "owner_id" },
      )
      .select("owner_id,plan,created_at,updated_at")
      .single();

    const row = ensureData(data as UserPlanRow | null, error, "Failed to save user plan");
    return toUserPlanRecord(row);
  },
};
