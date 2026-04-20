"use client";

import Link from "next/link";
import React from "react";
import { ArrowLeft, Crown, RefreshCw, Shield, UserRound } from "lucide-react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import type { AdminUserSummary } from "@/lib/server/admin-users";

type AdminUsersResponse = {
  users: AdminUserSummary[];
  viewer: {
    email: string | null;
    id: string;
  };
};

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

const formatDate = (value: string | null) => {
  if (!value) return "unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const usageRatio = (used: number, limit: number) => {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
};

type AdminUsersWorkspaceProps = {
  onBack?: () => void;
  standalone?: boolean;
};

function AdminUsersWorkspaceContent({ onBack, standalone = false }: AdminUsersWorkspaceProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [payload, setPayload] = React.useState<AdminUsersResponse | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = React.useState<string | null>(null);
  const [savingPlan, setSavingPlan] = React.useState<"free" | "paid" | null>(null);

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        headers: {
          "Content-Type": "application/json",
        },
        method: "GET",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Request failed: ${response.status}`);
      }
      const data = (await response.json()) as AdminUsersResponse;
      setPayload(data);
      setSelectedOwnerId((current) => current ?? data.users[0]?.ownerId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin users.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedUser =
    payload?.users.find((entry) => entry.ownerId === selectedOwnerId) ?? payload?.users[0] ?? null;

  const setPlan = React.useCallback(
    async (plan: "free" | "paid") => {
      if (!selectedUser) return;
      setSavingPlan(plan);
      setError("");
      try {
        const response = await fetch("/api/admin/users", {
          body: JSON.stringify({
            ownerId: selectedUser.ownerId,
            plan,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || `Request failed: ${response.status}`);
        }
        const result = (await response.json()) as { user: AdminUserSummary };
        setPayload((current) =>
          current
            ? {
                ...current,
                users: current.users.map((entry) =>
                  entry.ownerId === result.user.ownerId ? result.user : entry,
                ),
              }
            : current,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update user plan.");
      } finally {
        setSavingPlan(null);
      }
    },
    [selectedUser],
  );

  return (
    <div className={`${workspaceBackdropClassName} px-4 py-4 md:px-5 md:py-5`}>
      <WorkspaceShell>
        <div className="flex min-h-0 flex-col gap-5">
          <div className="flex flex-wrap items-start gap-3">
            {standalone ? (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/">Open workspace</Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={onBack}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Admin
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">Users</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Internal view to inspect account activity and switch users between free and paid plans.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>

          {error ? (
            <Card>
              <p className="text-sm text-rose-700">{error}</p>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Accounts
              </p>
              <div className="mt-4 space-y-2">
                {(payload?.users ?? []).length === 0 && !busy ? (
                  <p className="text-sm text-muted-foreground">
                    No known users yet. Users appear here once they have persisted data in the workspace.
                  </p>
                ) : null}
                {(payload?.users ?? []).map((user) => {
                  const active = user.ownerId === selectedUser?.ownerId;
                  return (
                    <button
                      key={user.ownerId}
                      type="button"
                      onClick={() => setSelectedOwnerId(user.ownerId)}
                      className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                        active
                          ? "border-sky-500/40 bg-sky-500/10"
                          : "border-border/70 bg-background/70 hover:bg-background/90"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm text-foreground">{user.ownerId}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {user.counts.sessions} sessions · {user.counts.projects} projects
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                            user.plan === "paid"
                              ? "border-emerald-400/30 bg-emerald-500/10 text-foreground"
                              : "border-border/70 bg-background/80 text-muted-foreground"
                          }`}
                        >
                          {user.plan}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-4">
              {!selectedUser ? (
                <Card>
                  <p className="text-sm text-muted-foreground">
                    Select a user to inspect plan, usage, and provider footprint.
                  </p>
                </Card>
              ) : (
                <>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                          <UserRound className="size-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Selected user
                          </p>
                          <h2 className="mt-1 font-mono text-base font-semibold text-foreground">
                            {selectedUser.ownerId}
                          </h2>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Created {formatDate(selectedUser.createdAt)} · last activity {formatDate(selectedUser.lastActivityAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedUser.plan === "free" ? "default" : "outline"}
                          disabled={savingPlan !== null}
                          onClick={() => void setPlan("free")}
                        >
                          {savingPlan === "free" ? "Saving..." : "Set free"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedUser.plan === "paid" ? "default" : "outline"}
                          disabled={savingPlan !== null}
                          onClick={() => void setPlan("paid")}
                        >
                          {savingPlan === "paid" ? "Saving..." : "Set paid"}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <Card>
                      <div className="flex items-start gap-3">
                        <div className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-foreground">
                          {selectedUser.plan === "paid" ? <Crown className="size-4" /> : <Shield className="size-4" />}
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Limits
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-foreground">
                            {selectedUser.plan === "paid" ? "Paid limits" : "Free limits"}
                          </h3>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">Per minute</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.limits.perMinute}</p>
                        </div>
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">Per hour</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.limits.perHour}</p>
                        </div>
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">Per day</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.limits.perDay}</p>
                        </div>
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">Concurrent</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.limits.concurrent}</p>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Provider footprint
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">OpenRouter keys</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.providers.openrouterKeyCount}</p>
                        </div>
                        <div className="rounded-[14px] border border-border/70 bg-background/75 px-4 py-3">
                          <p className="text-xs text-muted-foreground">Ollama keys</p>
                          <p className="mt-2 text-xl font-semibold text-foreground">{selectedUser.providers.ollamaKeyCount}</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    {[
                      ["Minute usage", selectedUser.usage.minuteCount, selectedUser.limits.perMinute],
                      ["Hour usage", selectedUser.usage.hourCount, selectedUser.limits.perHour],
                      ["Day usage", selectedUser.usage.dayCount, selectedUser.limits.perDay],
                    ].map(([label, used, limit]) => {
                      const percent = usageRatio(Number(used), Number(limit));
                      return (
                        <Card key={String(label)}>
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {label}
                          </p>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-foreground">{used}</span>
                            <span className="text-sm text-muted-foreground">of {limit}</span>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/70">
                            <div
                              className={`h-full rounded-full ${
                                percent >= 90 ? "bg-rose-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.max(6, percent)}%` }}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Sessions
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedUser.counts.sessions}</p>
                    </Card>
                    <Card>
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Projects
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedUser.counts.projects}</p>
                    </Card>
                    <Card>
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Agent tokens
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedUser.counts.agentTokens}</p>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </WorkspaceShell>
    </div>
  );
}

export function AdminUsersWorkspace() {
  const { showWorkspace } = useWorkspaceSurface();
  return <AdminUsersWorkspaceContent onBack={showWorkspace} />;
}

export function StandaloneAdminUsersWorkspace() {
  return <AdminUsersWorkspaceContent standalone />;
}
