"use client";

import { Bot, MessageCircleMore, Sparkles, Telescope } from "lucide-react";

type CanvasAgentAvatarProps = {
  insight: string | null;
  onClick: () => void;
  onDoubleClick: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  open: boolean;
  phase: "idle" | "walking" | "observing" | "thinking" | "speaking";
  position: { x: number; y: number };
};

const phaseAccent: Record<CanvasAgentAvatarProps["phase"], string> = {
  idle: "#64748b",
  walking: "#0ea5e9",
  observing: "#7c3aed",
  thinking: "#d97706",
  speaking: "#16a34a",
};

const phaseLabel: Record<CanvasAgentAvatarProps["phase"], string> = {
  idle: "Idle",
  walking: "Walking",
  observing: "Observing",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function CanvasAgentAvatar({
  insight,
  onClick,
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  open,
  phase,
  position,
}: CanvasAgentAvatarProps) {
  const accent = phaseAccent[phase];

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div
        className="pointer-events-none absolute h-20 w-20 rounded-full opacity-30 blur-2xl"
        style={{
          background: `radial-gradient(circle, ${accent}55 0%, transparent 72%)`,
          transform: `translate(${position.x - 10}px, ${position.y - 10}px)`,
        }}
      />
      <button
        type="button"
        aria-label="Open canvas guide"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="pointer-events-auto absolute flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background/96 shadow-[0_20px_50px_-26px_rgba(15,23,42,0.48)] transition-[transform,box-shadow] duration-500 ease-out hover:scale-[1.03]"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          boxShadow: open ? `0 0 0 3px ${accent}33, 0 18px 42px -24px ${accent}99` : `0 18px 42px -24px ${accent}99`,
        }}
      >
        <div
          className="absolute inset-1 rounded-full opacity-10 blur-md"
          style={{ backgroundColor: accent }}
        />
        <div
          className="absolute inset-[5px] rounded-full border"
          style={{ borderColor: `${accent}35` }}
        />
        <div
          className="absolute left-1/2 top-[10px] h-3.5 w-px -translate-x-1/2 rounded-full opacity-80"
          style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }}
        />
        <div
          className="absolute h-1.5 w-1.5 rounded-full border border-background/70 shadow-sm"
          style={{ backgroundColor: accent, top: 7, right: 7 }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background/70 shadow-[0_0_16px_-2px_currentColor]"
          style={{ backgroundColor: accent, color: accent }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-55"
          style={{ borderColor: `${accent}30` }}
        />
        <div
          className="absolute bottom-[10px] left-1/2 h-1 w-5 -translate-x-1/2 rounded-full opacity-80"
          style={{ backgroundColor: `${accent}80` }}
        />
        <div
          className="absolute bottom-[7px] left-1/2 h-px w-7 -translate-x-1/2 opacity-50"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
        <div
          className="absolute inset-[9px] rounded-full border opacity-50"
          style={{ borderColor: `${accent}20` }}
        />
        <div
          className="absolute -bottom-5 left-1/2 h-5 w-[82px] -translate-x-1/2 rounded-full opacity-25 blur-lg"
          style={{ backgroundColor: accent }}
        />
        <div className="relative flex items-center justify-center">
          <Bot className="h-[14px] w-[14px]" style={{ color: accent }} />
        </div>
      </button>

      <div
        className="pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-border/70 bg-background/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-sm transition-[transform] duration-500 ease-out"
        style={{
          transform: `translate(${position.x + 62}px, ${position.y + 16}px)`,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
        {phase === "observing" ? <Telescope className="h-3 w-3" /> : null}
        {phase === "speaking" ? <MessageCircleMore className="h-3 w-3" /> : null}
        {phase === "thinking" ? <Sparkles className="h-3 w-3" /> : null}
        <span>{phaseLabel[phase]}</span>
      </div>

      {insight && !open ? (
        <div
          className="pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-border/70 bg-background/94 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-sm transition-[transform,opacity] duration-500 ease-out"
          style={{
            opacity: 1,
            transform: `translate(${Math.max(16, position.x - 8)}px, ${Math.max(12, position.y - 34)}px)`,
          }}
        >
          <MessageCircleMore className="h-3 w-3 text-sky-700" />
          <span>Insight ready</span>
        </div>
      ) : null}
    </div>
  );
}
