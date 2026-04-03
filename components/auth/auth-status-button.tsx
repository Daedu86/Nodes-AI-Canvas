"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthStatusButton() {
  const { data: session } = useSession();
  const label =
    session?.user?.name?.trim() ||
    session?.user?.email?.trim() ||
    "Signed in";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground md:inline-flex">
        {label}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  );
}
