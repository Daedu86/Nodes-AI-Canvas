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
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sky-400/25 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.36),_rgba(15,23,42,0.94)_58%)] shadow-[0_10px_24px_-16px_rgba(56,189,248,0.85)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 40 40"
          className="size-7 text-slate-50"
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
          <span className="truncate text-sm font-semibold tracking-[0.18em] text-foreground uppercase">
            Nodes
          </span>
          {modeLabel ? (
            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-sky-200 uppercase">
              {modeLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
