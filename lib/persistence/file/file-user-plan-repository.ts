import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UserPlanRepository } from "@/lib/persistence/user-plan-repository";
import {
  normalizeUserPlan,
  type UserPlanRecord,
} from "@/lib/user-plan";

type StoredUserPlan = UserPlanRecord;

const PLAN_FILE_EXTENSION = ".json";

export const getUserPlanStoreDir = () =>
  process.env.USER_PLAN_STORE_DIR
    ? path.resolve(process.env.USER_PLAN_STORE_DIR)
    : path.join(process.cwd(), "data", "user-plans");

const getUserPlanFilePath = (ownerId: string) => {
  const digest = createHash("sha256").update(ownerId).digest("hex");
  return path.join(getUserPlanStoreDir(), `${digest}${PLAN_FILE_EXTENSION}`);
};

async function ensureUserPlanStoreDir() {
  await fs.mkdir(getUserPlanStoreDir(), { recursive: true });
}

async function writeStoredPlan(entry: StoredUserPlan) {
  await ensureUserPlanStoreDir();
  const filePath = getUserPlanFilePath(entry.ownerId);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(entry, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function readStoredPlan(ownerId: string): Promise<StoredUserPlan | null> {
  try {
    const raw = await fs.readFile(getUserPlanFilePath(ownerId), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredUserPlan>;
    return {
      createdAt:
        typeof parsed.createdAt === "string" && parsed.createdAt.length > 0
          ? parsed.createdAt
          : new Date().toISOString(),
      ownerId,
      plan: normalizeUserPlan(parsed.plan),
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export const fileUserPlanRepository: UserPlanRepository = {
  async getPlan(ownerId) {
    return readStoredPlan(ownerId);
  },

  async savePlan(ownerId, plan) {
    const existing = await readStoredPlan(ownerId);
    const now = new Date().toISOString();
    const next: StoredUserPlan = {
      createdAt: existing?.createdAt ?? now,
      ownerId,
      plan: normalizeUserPlan(plan),
      updatedAt: now,
    };
    await writeStoredPlan(next);
    return next;
  },
};
