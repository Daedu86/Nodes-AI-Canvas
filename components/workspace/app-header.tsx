"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ThreadTitleEditor } from "@/components/assistant-ui/thread-title";
import { ModelSelector } from "@/components/assistant-ui/model-selector";
import { ThreadGraphButton } from "@/components/assistant-ui/thread-graph";
import { LlmToggleButton } from "@/components/assistant-ui/llm-toggle";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { SessionContextSheet } from "@/components/workspace/session-context-sheet";

export const AppHeader = () => {
  const { llmEnabled } = useLlmEnabled();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>
              <ThreadTitleEditor />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <ModelSelector />
        <SessionContextSheet />
        <ThreadGraphButton />
        <span
          className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
            llmEnabled
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {llmEnabled ? "AI on" : "AI off"}
        </span>
        <LlmToggleButton />
      </div>
    </header>
  );
};
