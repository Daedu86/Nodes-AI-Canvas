"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp, MessageSquareText, Network, Workflow, X } from "lucide-react";
import React from "react";
import {
  buildWorkspaceOnboardingStorageKey,
  isWorkspaceOnboardingComplete,
} from "@/lib/client/workspace-onboarding";

type WorkspaceOnboardingDialogProps = {
  onOpenCanvas: () => void;
  userId: string | null;
};

const onboardingSteps = [
  {
    description: "Start with a concrete question or decision in Chat.",
    icon: MessageSquareText,
    title: "Ask",
  },
  {
    description: "Open Canvas to see branches, alternatives, and reusable context.",
    icon: Workflow,
    title: "Explore",
  },
  {
    description: "Add blocks and connect evidence, files, plans, and outputs.",
    icon: Network,
    title: "Structure",
  },
];

export function WorkspaceOnboardingDialog({
  onOpenCanvas,
  userId,
}: WorkspaceOnboardingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const storageKey = React.useMemo(
    () => buildWorkspaceOnboardingStorageKey(userId),
    [userId],
  );

  React.useEffect(() => {
    try {
      setOpen(!isWorkspaceOnboardingComplete(localStorage.getItem(storageKey)));
    } catch {
      setOpen(false);
    }
  }, [storageKey]);

  const completeOnboarding = React.useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage failures; the dialog remains manually accessible.
    }
    setOpen(false);
  }, [storageKey]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) completeOnboarding();
      else setOpen(true);
    },
    [completeOnboarding],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open workspace guide"
          title="Workspace guide"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-border/70 bg-background p-6 shadow-2xl focus:outline-none sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                Workspace guide
              </p>
              <Dialog.Title className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Turn a question into a structured decision
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Nodes combines a conversational thread with a visual canvas. You can move between both without losing context.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close workspace guide"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {onboardingSteps.map(({ description, icon: Icon, title }, index) => (
              <li key={title} className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">0{index + 1}</span>
                </div>
                <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-border/70 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={completeOnboarding}
            >
              Got it
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                onOpenCanvas();
                completeOnboarding();
              }}
            >
              <Workflow className="h-4 w-4" />
              Open split workspace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
