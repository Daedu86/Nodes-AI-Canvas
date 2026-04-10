"use client";

import { BookCopy, Bot, Columns2, FileText, MessageSquareText, Workflow } from "lucide-react";
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
import { LlmToggleButton } from "@/components/assistant-ui/llm-toggle";
import { useLlmEnabled } from "@/components/context/llm-enabled";
import { useSessionUiState, type SessionViewMode } from "@/components/context/session-ui-state";
import { SessionContextSheet } from "@/components/workspace/session-context-sheet";

export const AppHeader = () => {
  const { llmEnabled } = useLlmEnabled();
  const { viewMode, setViewMode } = useSessionUiState();

  const viewOptions: Array<{
    icon: typeof MessageSquareText;
    label: string;
    value: SessionViewMode;
  }> = [
    { icon: MessageSquareText, label: "Chat", value: "chat" },
    { icon: Workflow, label: "Canvas", value: "canvas" },
    { icon: BookCopy, label: "Wiki", value: "wiki" },
    { icon: FileText, label: "Brief", value: "brief" },
    { icon: Bot, label: "Nody", value: "nody" },
    { icon: Columns2, label: "Split", value: "split" },
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-card/88 px-4 backdrop-blur-md">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4 bg-border/80" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>
              <ThreadTitleEditor />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-1 flex items-center rounded-[12px] border border-border/80 bg-muted/55 p-1">
        {viewOptions.map(({ icon: Icon, label, value }) => {
          const isActive = viewMode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              aria-label={`Show ${label.toLowerCase()} panel`}
              className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] font-medium transition ${
                isActive
                  ? "border border-border/80 bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
              onClick={() => setViewMode(value)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ModelSelector />
        <SessionContextSheet />
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
            llmEnabled
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/25 bg-amber-500/10 text-amber-200"
          }`}
        >
          {llmEnabled ? "AI on" : "AI off"}
        </span>
        <LlmToggleButton />
      </div>
    </header>
  );
};
