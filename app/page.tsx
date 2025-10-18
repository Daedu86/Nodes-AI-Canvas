"use client"

import { Assistant } from "./assistant";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";


export default function Page() {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return <Assistant />;
}