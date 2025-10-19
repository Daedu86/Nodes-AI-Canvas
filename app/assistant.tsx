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
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ThreadTitle, ThreadTitleEditor } from "@/components/assistant-ui/thread-title";
import { ThreadGraphButton } from "@/components/assistant-ui/thread-graph";
import { ThreadGraphInline } from "@/components/assistant-ui/thread-graph-inline";
import { HistoryModeProvider } from "@/components/context/history-mode";
import { LlmEnabledProvider } from "@/components/context/llm-enabled";
import { LlmToggleButton } from "@/components/assistant-ui/llm-toggle";

export const Assistant = () => {
  const [historyMode, setHistoryMode] = useState<"last" | "full">("last");
  const hasMounted = useRef(false);
  const [llmEnabled, setLlmEnabled] = useState<boolean>(true);
  const [splitRatio, setSplitRatio] = useState(0.6);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const resizingRef = useRef(false);
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

  const clampFraction = useCallback((value: number, containerWidth?: number) => {
    if (!containerWidth || containerWidth <= 0) {
      return Math.min(0.8, Math.max(0.2, value));
    }
    const MIN_PANEL_WIDTH = 260;
    const handleWidth = 8;
    const usableWidth = Math.max(containerWidth - handleWidth, 1);
    const minFraction = Math.min(0.5, MIN_PANEL_WIDTH / usableWidth);
    const maxFraction = Math.max(minFraction, 1 - minFraction);
    const clamped = Math.min(maxFraction, Math.max(minFraction, value));
    return Number.isFinite(clamped) ? clamped : minFraction;
  }, []);

  useEffect(() => {
    const clampToWidth = () => {
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio((prev) => clampFraction(prev, width));
    };
    clampToWidth();
    window.addEventListener("resize", clampToWidth);
    return () => window.removeEventListener("resize", clampToWidth);
  }, [clampFraction]);

  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    []
  );

  const updateSplitFromPointer = useCallback((clientX: number) => {
    if (!splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relative = (clientX - rect.left) / rect.width;
    setSplitRatio(clampFraction(relative, rect.width));
  }, [clampFraction]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) return;
    resizingRef.current = true;
    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    document.body.style.cursor = "col-resize";
    updateSplitFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current || pointerIdRef.current !== e.pointerId) return;
    updateSplitFromPointer(e.clientX);
  };

  const stopResizing = (e?: React.PointerEvent<HTMLDivElement>) => {
    resizingRef.current = false;
    pointerIdRef.current = null;
    document.body.style.cursor = "";
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleSeparatorDoubleClick = () => {
    const width = splitRef.current?.getBoundingClientRect().width ?? 0;
    setSplitRatio(clampFraction(0.6, width));
  };

  const handleSeparatorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio((prev) => clampFraction(prev - 0.03, width));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio((prev) => clampFraction(prev + 0.03, width));
    } else if (e.key === "Home") {
      e.preventDefault();
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio(clampFraction(0.3, width));
    } else if (e.key === "End") {
      e.preventDefault();
      const width = splitRef.current?.getBoundingClientRect().width ?? 0;
      setSplitRatio(clampFraction(0.7, width));
    }
  };

  const leftStyle = { flex: splitRatio, minWidth: 220 };
  const rightStyle = { flex: Math.max(0.1, 1 - splitRatio), minWidth: 220 };

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
          <div className="flex flex-1 flex-col overflow-hidden">
            <div ref={splitRef} className="flex flex-1 min-h-0 gap-3 px-4 py-4">
              <div
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background"
                style={leftStyle}
              >
                <Thread />
              </div>
              <div
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label="Resize panels"
                className="group relative flex h-full w-2 cursor-col-resize items-center justify-center rounded bg-border/40 outline-none transition-colors focus-visible:bg-primary/30"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopResizing}
                onPointerCancel={stopResizing}
                onLostPointerCapture={stopResizing}
                onDoubleClick={handleSeparatorDoubleClick}
                onKeyDown={handleSeparatorKeyDown}
              >
                <span className="pointer-events-none h-16 w-px rounded-full bg-border/80 transition-colors group-hover:bg-primary" />
              </div>
              <div
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background"
                style={rightStyle}
              >
                <ThreadGraphInline />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      </LlmEnabledProvider>
      </HistoryModeProvider>
    </AssistantRuntimeProvider>
  );
};






