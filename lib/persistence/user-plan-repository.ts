import type { UserPlan, UserPlanRecord } from "@/lib/user-plan";

export interface UserPlanRepository {
  getPlan(ownerId: string): Promise<UserPlanRecord | null>;
  savePlan(ownerId: string, plan: UserPlan): Promise<UserPlanRecord>;
}
