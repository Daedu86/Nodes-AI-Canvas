"use client";

import type { ChatUsageSnapshot } from "@/lib/chat-usage";
import type { ChatQuotaLimits, UserPlan } from "@/lib/user-plan";

export type AccountPlanResponse = {
  isAdmin: boolean;
  limits: ChatQuotaLimits;
  plan: {
    current: UserPlan;
  };
  providers: {
    ollama: {
      keyCount: number;
    };
    openrouter: {
      hasDeploymentKey: boolean;
      keyCount: number;
      requireUserKey: boolean;
    };
  };
  usage: ChatUsageSnapshot;
};

export async function fetchAccountPlan() {
  const response = await fetch("/api/account/plan", {
    headers: {
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to load account plan: ${response.status}`);
  }

  return (await response.json()) as AccountPlanResponse;
}
