"use client";

import React from "react";
import { BookOpenText, Bot, LogOut, UserRound } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useWorkspaceSurface } from "@/components/context/workspace-surface";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function SidebarProfile() {
  const { data: session } = useSession();
  const { activeSurface, showKnowledgeCenter, showLlmModels } = useWorkspaceSurface();
  const displayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.trim() ||
    "Signed in";

  return (
    <div className="rounded-[16px] border border-border/80 bg-card/88 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start gap-3">
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

      <div className="mt-3 flex flex-col gap-2">
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
    </div>
  );
}
