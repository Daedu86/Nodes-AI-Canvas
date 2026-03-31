"use client";

import {
  Bot,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Sparkles,
  Telescope,
  Waypoints,
} from "lucide-react";
import {
  getCanvasGuideActionLabel,
  type CanvasGuideAction,
} from "@/lib/canvas-agent/canvas-agent-context";

type CanvasAgentPanelProps = {
  busy: boolean;
  error: string | null;
  focusLabel: string;
  insight: string | null;
  lastAction: CanvasGuideAction | null;
  llmEnabled: boolean;
  onAsk: () => void;
  onQuestionChange: (value: string) => void;
  onRunAction: (action: CanvasGuideAction) => void;
  onToggle: () => void;
  open: boolean;
  phase: "idle" | "walking" | "observing" | "thinking" | "speaking";
  question: string;
};

const phaseLabel: Record<CanvasAgentPanelProps["phase"], string> = {
  idle: "Idle",
  walking: "Walking",
  observing: "Observing",
  thinking: "Thinking",
  speaking: "Speaking",
};

const quickActions: Array<{
  action: CanvasGuideAction;
  icon: typeof Sparkles;
}> = [
  { action: "explain-focus", icon: Sparkles },
  { action: "summarize-branch", icon: Waypoints },
  { action: "survey-tree", icon: Telescope },
];

export function CanvasAgentPanel({
  busy,
  error,
  focusLabel,
  insight,
  lastAction,
  llmEnabled,
  onAsk,
  onQuestionChange,
  onRunAction,
  onToggle,
  open,
  phase,
  question,
}: CanvasAgentPanelProps) {
  const statusLabel = busy ? "Synthesizing" : llmEnabled ? "Ready" : "Offline";
  const statusDotClass = busy ? "bg-amber-500" : llmEnabled ? "bg-emerald-500" : "bg-rose-500";
  const compactFocusLabel = focusLabel.trim().length > 0 ? focusLabel : "Session tree";

  return (
    <aside
      aria-label="Canvas guide panel"
      aria-hidden={!open}
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 overflow-hidden border-t border-border/60 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(239,246,255,0.96))] backdrop-blur transition-[max-height] duration-300 ${
        open ? "max-h-[380px]" : "max-h-[68px]"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(90deg,rgba(14,165,233,0.10),rgba(56,189,248,0.02),rgba(124,58,237,0.06))]" />

      <div className="relative flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="pointer-events-none min-w-0 flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/8 text-sky-700">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Guide Beacon</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                {phaseLabel[phase]}
              </span>
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {statusLabel}
              </span>
            </div>
            {open ? (
              <p className="truncate text-xs text-muted-foreground">
                Focus: {compactFocusLabel}
                {lastAction ? ` · ${getCanvasGuideActionLabel(lastAction)}` : ""}
              </p>
            ) : (
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Standing On
                </span>
                <span className="truncate text-xs text-foreground/80">{compactFocusLabel}</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label={open ? "Collapse guide" : "Expand guide"}
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground hover:bg-muted"
          onClick={onToggle}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={`relative min-h-0 overflow-y-auto overscroll-contain px-4 py-3 transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ maxHeight: 312 }}
      >
        <div className="space-y-3">
            <div className="rounded-[20px] border border-border/60 bg-background/88 px-3 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Guide Insight
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Beacon
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {insight ??
                  (llmEnabled
                    ? "I am ready. Ask me to explain the focus, summarize this branch, or survey the full tree."
                    : "Enable AI to let the guide reason over the canvas.")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ action, icon: Icon }) => (
                <button
                  key={action}
                  type="button"
                  aria-label={getCanvasGuideActionLabel(action)}
                  disabled={busy || !llmEnabled}
                  className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/84 px-3 py-2 text-xs font-medium text-foreground/88 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => onRunAction(action)}
                >
                  <Icon className="h-3.5 w-3.5 text-sky-700" />
                  <span>{getCanvasGuideActionLabel(action)}</span>
                </button>
              ))}
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700"
              >
                {error}
              </div>
            ) : null}

          <div className="rounded-[20px] border border-border/60 bg-background/88 px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-sky-700" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ask The Guide
              </p>
            </div>
            <textarea
              aria-label="Ask canvas guide"
              rows={2}
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              placeholder="Ask what this branch means or what context is missing..."
              className="mt-3 min-h-[76px] w-full resize-y rounded-[16px] border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500/35"
            />
            <button
              type="button"
              disabled={busy || !llmEnabled || question.trim().length === 0}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-500/28 bg-sky-500/10 px-3.5 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onAsk}
            >
              <Sparkles className="h-4 w-4" />
              <span>Ask guide</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
