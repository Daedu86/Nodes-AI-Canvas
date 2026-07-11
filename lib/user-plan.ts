export type UserPlan = "free" | "paid";

export type UserPlanRecord = {
  createdAt: string;
  ownerId: string;
  plan: UserPlan;
  updatedAt: string;
};

export type ChatQuotaLimits = {
  concurrent: number;
  perDay: number;
  perHour: number;
  perMinute: number;
  plan: UserPlan;
};

const FREE_PLAN_DEFAULTS = {
  concurrent: 3,
  perDay: 120,
  perHour: 40,
  perMinute: 8,
} as const;

const PAID_PLAN_DEFAULTS = {
  concurrent: 6,
  perDay: 600,
  perHour: 120,
  perMinute: 24,
} as const;

const getPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const normalizeUserPlan = (value: string | null | undefined): UserPlan =>
  value === "paid" ? "paid" : "free";

export const getDefaultUserPlan = () =>
  normalizeUserPlan(process.env.NODES_DEFAULT_USER_PLAN);

const getPlanLimit = ({
  fallback,
  legacyEnvName,
  plan,
  suffix,
}: {
  fallback: number;
  legacyEnvName?: string;
  plan: UserPlan;
  suffix: "CHAT_LIMIT_CONCURRENT" | "CHAT_LIMIT_PER_DAY" | "CHAT_LIMIT_PER_HOUR" | "CHAT_LIMIT_PER_MINUTE";
}) => {
  const specificEnvName = `NODES_PLAN_${plan.toUpperCase()}_${suffix}`;
  const specificValue = process.env[specificEnvName];
  if (specificValue !== undefined) {
    return getPositiveInt(specificValue, fallback);
  }
  if (legacyEnvName && plan === "paid") {
    return getPositiveInt(process.env[legacyEnvName], fallback);
  }
  return fallback;
};

export const getChatQuotaLimits = (plan: UserPlan): ChatQuotaLimits => {
  const defaults = plan === "paid" ? PAID_PLAN_DEFAULTS : FREE_PLAN_DEFAULTS;
  return {
    concurrent: getPlanLimit({
      fallback: defaults.concurrent,
      legacyEnvName: "NODES_CHAT_LIMIT_CONCURRENT",
      plan,
      suffix: "CHAT_LIMIT_CONCURRENT",
    }),
    perDay: getPlanLimit({
      fallback: defaults.perDay,
      plan,
      suffix: "CHAT_LIMIT_PER_DAY",
    }),
    perHour: getPlanLimit({
      fallback: defaults.perHour,
      legacyEnvName: "NODES_CHAT_LIMIT_PER_HOUR",
      plan,
      suffix: "CHAT_LIMIT_PER_HOUR",
    }),
    perMinute: getPlanLimit({
      fallback: defaults.perMinute,
      legacyEnvName: "NODES_CHAT_LIMIT_PER_MINUTE",
      plan,
      suffix: "CHAT_LIMIT_PER_MINUTE",
    }),
    plan,
  };
};

export const isOpenRouterDeploymentKeyAllowedForPlan = (plan: UserPlan) =>
  plan === "paid" &&
  process.env.OPENROUTER_ALLOW_DEPLOYMENT_KEY === "1" &&
  Boolean(process.env.OPENROUTER_API_KEY?.trim());

export const isOpenRouterUserKeyRequiredForPlan = (plan: UserPlan) =>
  plan === "free" ||
  process.env.OPENROUTER_REQUIRE_USER_KEY === "1" ||
  !isOpenRouterDeploymentKeyAllowedForPlan(plan);

export const getOpenRouterCredentialPolicy = (plan: UserPlan) => ({
  hasDeploymentKey: isOpenRouterDeploymentKeyAllowedForPlan(plan),
  requireUserKey: isOpenRouterUserKeyRequiredForPlan(plan),
});
