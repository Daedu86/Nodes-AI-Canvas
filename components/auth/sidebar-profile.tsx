"use client";

import React from "react";
import {
  Activity,
  BarChart3,
  BookOpenText,
  Bot,
  ChevronDownIcon,
  ChevronRightIcon,
  LifeBuoy,
  KeyRound,
  LogOut,
  Shield,
  UserRound,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { fetchAccountPlan } from "@/lib/client/account-plan";

export function SidebarProfile() {
  const { data: session } = useSession();
  const {
    activeSurface,
    showAdminUsers,
    showAgentAccess,
    showAgentWork,
    showKnowledgeCenter,
    showLlmModels,
    showPlanUsage,
    showSupport,
  } = useWorkspaceSurface();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(true);
  const displayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.trim() ||
    "Signed in";

  React.useEffect(() => {
    let cancelled = false;
    void fetchAccountPlan()
      .then((data) => {
        if (!cancelled) {
          setIsAdmin(Boolean(data.isAdmin));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[16px] border border-border/80 bg-card/88 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div
          className="flex size-9 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-muted-foreground"
          title={displayName}
        >
          <UserRound className="size-4" />
        </div>

        <Button
          type="button"
          variant={activeSurface === "plan-usage" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showPlanUsage}
          title="Plan & Usage"
          aria-label="Plan & Usage"
        >
          <BarChart3 className="size-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === "knowledge-center" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showKnowledgeCenter}
          title="Knowledge Center"
          aria-label="Knowledge Center"
        >
          <BookOpenText className="size-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === "llm-models" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showLlmModels}
          title="LLM Models"
          aria-label="LLM Models"
        >
          <Bot className="size-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === "support" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showSupport}
          title="Support"
          aria-label="Support"
        >
          <LifeBuoy className="size-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === "agent-access" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showAgentAccess}
          title="Agent Access"
          aria-label="Agent Access"
        >
          <KeyRound className="size-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === "agent-work" ? "default" : "outline"}
          size="icon"
          className="size-9"
          onClick={showAgentWork}
          title="Agent Work"
          aria-label="Agent Work"
        >
          <Activity className="size-4" />
        </Button>
        {isAdmin ? (
          <Button
            type="button"
            variant={activeSurface === "admin-users" ? "default" : "outline"}
            size="icon"
            className="size-9"
            onClick={showAdminUsers}
            title="Admin Users"
            aria-label="Admin Users"
          >
            <Shield className="size-4" />
          </Button>
        ) : null}
        <ThemeToggle
          variant="outline"
          size="icon"
          className="size-9"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          onClick={() => void signOut({ callbackUrl: "/" })}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-border/80 bg-card/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 rounded-[12px] px-1 py-1 text-left hover:bg-muted/40"
        onClick={() => setProfileOpen((prev) => !prev)}
        aria-expanded={profileOpen}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border/80 bg-muted/60 text-muted-foreground">
            <UserRound className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Profile
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{displayName}</p>
          </div>
        </div>
        <span className="mt-1 text-muted-foreground" aria-hidden="true">
          {profileOpen ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </span>
      </button>

      {profileOpen ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            variant={activeSurface === "plan-usage" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showPlanUsage}
          >
            <BarChart3 className="size-4" />
            Plan &amp; Usage
          </Button>
          <Button
            type="button"
            variant={activeSurface === "knowledge-center" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showKnowledgeCenter}
          >
            <BookOpenText className="size-4" />
            Knowledge Center
          </Button>
          <Button
            type="button"
            variant={activeSurface === "llm-models" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showLlmModels}
          >
            <Bot className="size-4" />
            LLM Models
          </Button>
          <Button
            type="button"
            variant={activeSurface === "support" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showSupport}
          >
            <LifeBuoy className="size-4" />
            Support
          </Button>
          <Button
            type="button"
            variant={activeSurface === "agent-access" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showAgentAccess}
          >
            <KeyRound className="size-4" />
            Agent Access
          </Button>
          <Button
            type="button"
            variant={activeSurface === "agent-work" ? "default" : "outline"}
            size="sm"
            className="w-full justify-start"
            onClick={showAgentWork}
          >
            <Activity className="size-4" />
            Agent Work
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              variant={activeSurface === "admin-users" ? "default" : "outline"}
              size="sm"
              className="w-full justify-start"
              onClick={showAdminUsers}
            >
              <Shield className="size-4" />
              Admin Users
            </Button>
          ) : null}
          <ThemeToggle
            variant="outline"
            size="sm"
            className="w-full justify-start"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );
}
