"use client";

import React from "react";
import { ArrowLeft, BarChart3, Check, Crown, Gauge, KeyRound, ShieldCheck } from "lucide-react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { fetchAccountPlan, type AccountPlanResponse } from "@/lib/client/account-plan";

const workspaceBackdropClassName =
  "flex flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(11,13,19,0.92),rgba(9,11,16,0.98))]";
const shellClassName =
  "h-full min-h-0 overflow-hidden rounded-[20px] border border-border/80 bg-card/94 shadow-[0_20px_54px_-38px_rgba(0,0,0,0.7)] backdrop-blur-md";
const shellInnerClassName =
  "h-full min-h-0 overflow-auto rounded-[18px] bg-background/92 p-5 md:p-6";

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={shellClassName}>
      <div className={shellInnerClassName}>{children}</div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[18px] border border-border/80 bg-card/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

const formatDateTime = (value: number) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};

const getWindowResetAt = (
  scope: "day" | "hour" | "minute",
  usage: AccountPlanResponse["usage"],
) => {
  if (scope === "minute") {
    return usage.minuteWindowStart + 60_000;
  }
  if (scope === "hour") {
    return usage.hourWindowStart + 60 * 60_000;
  }
  return usage.dayWindowStart + 24 * 60 * 60_000;
};

function UsageMetricCard({
  count,
  limit,
  resetAt,
  title,
}: {
  count: number;
  limit: number;
  resetAt: number;
  title: string;
}) {
  const remaining = Math.max(0, limit - count);
  const percent = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-foreground">{remaining}</span>
            <span className="text-sm text-muted-foreground">remaining</span>
          </div>
        </div>
        <div className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          {count}/{limit}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/70">
        <div
          className={`h-full rounded-full ${
            percent >= 90 ? "bg-rose-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.max(6, percent)}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Resets at {formatDateTime(resetAt)}
      </p>
    </Card>
  );
}

export function PlanUsageWorkspace() {
  const { showAdminUsers, showWorkspace } = useWorkspaceSurface();
  const [data, setData] = React.useState<AccountPlanResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await fetchAccountPlan());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load plan details.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan = data?.plan.current ?? "free";
  const planTone =
    plan === "paid"
      ? "border-emerald-400/30 bg-emerald-500/10 text-foreground"
      : "border-sky-400/30 bg-sky-500/10 text-foreground";

  return (
    <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
      <WorkspaceShell>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-wrap items-start gap-3">
            <Button type="button" variant="outline" size="sm" onClick={showWorkspace}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Profile
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">Plan &amp; Usage</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                See your current tier, request limits, and whether your own provider key is required.
              </p>
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${planTone}`}>
              {plan === "paid" ? "Paid tier" : "Free tier"}
            </div>
          </div>

          {error ? (
            <Card>
              <p className="text-sm text-rose-700">{error}</p>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            </Card>
          ) : null}

          {!data && !error ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                {busy ? "Loading your current plan and usage…" : "Preparing your account summary…"}
              </p>
            </Card>
          ) : null}

          {data ? (
            <>
              <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                <Card>
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                      {plan === "paid" ? <Crown className="size-4" /> : <Gauge className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Current plan
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-foreground">
                        {plan === "paid" ? "Paid" : "Free"}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {plan === "paid"
                          ? "This account can use the deployment OpenRouter key when the deployment allows it."
                          : "This account is BYOK-first. Free tier requires your own OpenRouter key."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[16px] border border-border/70 bg-background/75 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Concurrency
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {data.limits.concurrent}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">parallel runs allowed</p>
                    </div>
                    <div className="rounded-[16px] border border-border/70 bg-background/75 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        OpenRouter mode
                      </p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {data.providers.openrouter.requireUserKey ? "BYOK required" : "Deployment key allowed"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.providers.openrouter.keyCount} saved OpenRouter key
                        {data.providers.openrouter.keyCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                      <KeyRound className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Provider access
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-foreground">OpenRouter</h2>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-[16px] border border-border/70 bg-background/75 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Check className="size-4 text-emerald-500" />
                        {data.providers.openrouter.keyCount > 0
                          ? "User key configured"
                          : "No user key configured"}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {data.providers.openrouter.requireUserKey
                          ? "This account must provide its own OpenRouter key in LLM Models."
                          : data.providers.openrouter.hasDeploymentKey
                            ? "This account can fall back to the deployment OpenRouter key."
                            : "This deployment has no shared OpenRouter key available."}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-border/70 bg-background/75 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <ShieldCheck className="size-4 text-sky-500" />
                        Ollama keys
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {data.providers.ollama.keyCount} saved Ollama key
                        {data.providers.ollama.keyCount === 1 ? "" : "s"} for protected cloud endpoints.
                      </p>
                    </div>

                    {data.isAdmin ? (
                      <div className="rounded-[16px] border border-violet-400/25 bg-violet-500/10 p-4">
                        <p className="text-sm font-medium text-foreground">Admin tools available</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          This account can manage user tiers directly from the internal admin workspace.
                        </p>
                        <div className="mt-3">
                          <Button type="button" size="sm" onClick={showAdminUsers}>
                            Open Admin Users
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <UsageMetricCard
                  title="Per minute"
                  count={data.usage.minuteCount}
                  limit={data.limits.perMinute}
                  resetAt={getWindowResetAt("minute", data.usage)}
                />
                <UsageMetricCard
                  title="Per hour"
                  count={data.usage.hourCount}
                  limit={data.limits.perHour}
                  resetAt={getWindowResetAt("hour", data.usage)}
                />
                <UsageMetricCard
                  title="Per day"
                  count={data.usage.dayCount}
                  limit={data.limits.perDay}
                  resetAt={getWindowResetAt("day", data.usage)}
                />
              </div>

              <Card>
                <div className="flex items-start gap-3">
                  <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                    <BarChart3 className="size-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Notes
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">How the current tier behaves</h2>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground/90">
                    Limits are enforced on chat, title generation, canvas guide, and agent chat so secondary surfaces cannot bypass the tier.
                  </div>
                  <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground/90">
                    Free tier is intended for BYOK usage. If there is no OpenRouter key, requests will fail with a direct configuration message.
                  </div>
                  <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground/90">
                    Paid tier assignment is server-side only. The client can inspect the plan, but it cannot upgrade itself.
                  </div>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </WorkspaceShell>
    </div>
  );
}
