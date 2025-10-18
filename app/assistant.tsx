"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ThreadTitle, ThreadTitleEditor } from "@/components/assistant-ui/thread-title";
import { ThreadGraphButton } from "@/components/assistant-ui/thread-graph";
import { HistoryModeProvider } from "@/components/context/history-mode";
import { LlmEnabledProvider } from "@/components/context/llm-enabled";
import { LlmToggleButton } from "@/components/assistant-ui/llm-toggle";

export const Assistant = () => {
  const [historyMode, setHistoryMode] = useState<"last" | "full">("last");
  const hasMounted = useRef(false);
  const [llmEnabled, setLlmEnabled] = useState<boolean>(true);
  // Read saved mode after mount to avoid SSR/client mismatch
  useEffect(() => {
    try {
      const s = localStorage.getItem("historyMode");
      if (s === "full" || s === "last") setHistoryMode(s as "last" | "full");
      const l = localStorage.getItem("llmEnabled");
      if (l === "true" || l === "false") setLlmEnabled(l === "true");
    } catch {}
    hasMounted.current = true;
  }, []);
  // Persist after initial mount
  useEffect(() => {
    if (!hasMounted.current) return;
    try {
      localStorage.setItem("historyMode", historyMode);
    } catch {}
  }, [historyMode]);
  useEffect(() => {
    if (!hasMounted.current) return;
    try {
      localStorage.setItem("llmEnabled", String(llmEnabled));
    } catch {}
  }, [llmEnabled]);

  const runtime = useChatRuntime({
    api: "/api/chat",
    body: { historyMode },
  });

  useEffect(() => {
    if (!runtime) return;

    console.group("[Assistant.tsx] Runtime Overview");

    // Mostrar runtime general
    console.log("Runtime general:", runtime);

    // Mostrar el objeto threads
    console.group("runtime.threads");
    console.log(runtime.threads);
    console.groupEnd();

    // Mostrar threads.main runtime si existe
    if (runtime.threads?.main) {
      console.group("runtime.threads.main");
      console.log(runtime.threads.main);

      // Mostrar composer runtime dentro del thread principal
      if (runtime.threads.main.composer) {
        console.group("runtime.threads.main.composer");
        console.log(runtime.threads.main.composer);
        console.groupEnd();
      }

      console.groupEnd();
    }

    console.groupEnd();
  }, [runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HistoryModeProvider value={historyMode} setValue={setHistoryMode}>
      <LlmEnabledProvider value={llmEnabled} setValue={setLlmEnabled}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Build Your Own ChatGPT UX</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    <ThreadTitleEditor />
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <ThreadGraphButton />
              <LlmToggleButton />
              <ThemeToggle />
            </div>
          </header>
          <Thread />
        </SidebarInset>
      </SidebarProvider>
      </LlmEnabledProvider>
      </HistoryModeProvider>
    </AssistantRuntimeProvider>
  );
};






