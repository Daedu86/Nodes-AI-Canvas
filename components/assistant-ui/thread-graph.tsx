"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { GitBranch, X } from "lucide-react";
import React from "react";

import { ThreadGraphFlow } from "./thread-graph-flow/thread-graph-flow";

export function ThreadGraphButton() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
          title="Show message tree"
        >
          <GitBranch className="h-3.5 w-3.5" /> Tree
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 h-[85vh] w-[min(96vw,1200px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border bg-background shadow-lg">
          <Dialog.Title className="sr-only">Thread Flow Viewer</Dialog.Title>
          <div className="flex items-center justify-end border-b p-3">
            <Dialog.Close asChild>
              <button type="button" className="rounded p-1 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="h-[calc(85vh-44px)] w-full overflow-hidden">
            <ThreadGraphFlow />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
