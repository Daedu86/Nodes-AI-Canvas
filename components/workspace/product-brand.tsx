"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ProductBrandProps = {
  modeLabel?: string;
  compact?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function ProductBrand({
  className,
  modeLabel,
  ...props
}: ProductBrandProps) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,24,31,0.96),rgba(15,15,21,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 40 40"
          className="size-6 text-slate-50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 29V11" className="opacity-90" />
          <path d="M11 11L29 29" className="opacity-90" />
          <path d="M29 29V11" className="opacity-90" />
          <circle cx="11" cy="11" r="3.25" fill="currentColor" stroke="none" />
          <circle cx="11" cy="29" r="3.25" fill="currentColor" stroke="none" />
          <circle cx="29" cy="11" r="3.25" fill="currentColor" stroke="none" />
          <circle cx="29" cy="29" r="3.25" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold tracking-[0.16em] text-foreground uppercase">
            Nodes
          </span>
          {modeLabel ? (
            <span className="rounded-full border border-border/80 bg-muted/80 px-2 py-0.5 text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {modeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
