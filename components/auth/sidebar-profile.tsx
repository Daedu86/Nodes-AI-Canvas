"use client";

import React from "react";
import { Bot, LogOut, UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function SidebarProfile() {
  const { data: session } = useSession();
  const { activeSurface, showLlmModels } = useWorkspaceSurface();
  const displayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.trim() ||
    "Signed in";

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/60 text-muted-foreground">
          <UserRound className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Profile
          </p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{displayName}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button
          type="button"
          variant={activeSurface === "llm-models" ? "default" : "outline"}
          size="sm"
          className="w-full justify-start rounded-lg"
          onClick={showLlmModels}
        >
          <Bot className="size-4" />
          LLM Models
        </Button>
        <ThemeToggle
          variant="outline"
          size="sm"
          className="w-full justify-start rounded-lg"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start rounded-lg"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
