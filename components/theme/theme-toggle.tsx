"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? (stored as Theme) : "dark";
}

export function ThemeToggle({
  className,
  size = "sm",
  variant = "ghost",
}: {
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const nextTheme = theme === "dark" ? "light" : "dark";
  const actionLabel = `Switch to ${nextTheme} mode`;
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const iconOnly = size === "icon";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggle}
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(className)}
    >
      <ThemeIcon className={cn("size-4", !iconOnly && "mr-2")} />
      {!iconOnly ? <span className="truncate">{nextTheme === "light" ? "Light" : "Dark"}</span> : null}
    </Button>
  );
}
