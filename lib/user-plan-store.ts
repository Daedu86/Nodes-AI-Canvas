import { getUserPlanRepository } from "@/lib/persistence/repositories";
import {
  getDefaultUserPlan,
  normalizeUserPlan,
  type UserPlan,
  type UserPlanRecord,
} from "@/lib/user-plan";

const isMissingUserPlanStorageError = (error: unknown) =>
  error instanceof Error &&
  /user_plans/i.test(error.message) &&
  /(schema cache|could not find the table|relation)/i.test(error.message);

const createDefaultUserPlanRecord = (ownerId: string, plan = getDefaultUserPlan()): UserPlanRecord => {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    ownerId,
    plan,
    updatedAt: now,
  };
};

export async function getUserPlanRecord(ownerId: string): Promise<UserPlanRecord> {
  try {
    return (await getUserPlanRepository().getPlan(ownerId)) ?? createDefaultUserPlanRecord(ownerId);
  } catch (error) {
    if (isMissingUserPlanStorageError(error)) {
      return createDefaultUserPlanRecord(ownerId);
    }
    throw error;
  }
}

export async function getUserPlan(ownerId: string): Promise<UserPlan> {
  const record = await getUserPlanRecord(ownerId);
  return record.plan;
}

export async function saveUserPlan(ownerId: string, plan: UserPlan): Promise<UserPlanRecord> {
  try {
    return await getUserPlanRepository().savePlan(ownerId, normalizeUserPlan(plan));
  } catch (error) {
    if (isMissingUserPlanStorageError(error)) {
      return createDefaultUserPlanRecord(ownerId, normalizeUserPlan(plan));
    }
    throw error;
  }
}
