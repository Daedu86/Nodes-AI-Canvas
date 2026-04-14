"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { hasPostAuthChatHandoff } from "@/lib/client/post-auth-handoff";

export type WorkspaceSurface = "agent-access" | "agent-work" | "knowledge-center" | "llm-models" | "workspace";

type WorkspaceSurfaceContextValue = {
  activeSurface: WorkspaceSurface;
  showAgentAccess: () => void;
  showAgentWork: () => void;
  showKnowledgeCenter: () => void;
  setActiveSurface: (value: WorkspaceSurface) => void;
  showLlmModels: () => void;
  showWorkspace: () => void;
};

const WorkspaceSurfaceContext = React.createContext<WorkspaceSurfaceContextValue | null>(null);

const DEFAULT_SURFACE: WorkspaceSurface = "workspace";

const readSurface = (storageKey: string) => {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "agent-access") return "agent-access";
    if (value === "agent-work") return "agent-work";
    if (value === "llm-models") return "llm-models";
    if (value === "knowledge-center") return "knowledge-center";
    return DEFAULT_SURFACE;
  } catch {
    return DEFAULT_SURFACE;
  }
};

export function WorkspaceSurfaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const storageKey = React.useMemo(
    () => `nodes.workspace-surface.v1:${session?.user?.id ?? "guest"}`,
    [session?.user?.id],
  );
  const [activeSurface, setActiveSurface] = React.useState<WorkspaceSurface>(DEFAULT_SURFACE);
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
    const next = hasPostAuthChatHandoff() ? DEFAULT_SURFACE : readSurface(storageKey);
    hasLoadedRef.current = true;
    setActiveSurface(next);
  }, [storageKey]);

  React.useEffect(() => {
    if (!hasLoadedRef.current) return;
    try {
      localStorage.setItem(storageKey, activeSurface);
    } catch {
      // ignore storage errors
    }
  }, [activeSurface, storageKey]);

  const value = React.useMemo<WorkspaceSurfaceContextValue>(
    () => ({
      activeSurface,
      showAgentAccess: () => setActiveSurface("agent-access"),
      showAgentWork: () => setActiveSurface("agent-work"),
      showKnowledgeCenter: () => setActiveSurface("knowledge-center"),
      setActiveSurface,
      showLlmModels: () => setActiveSurface("llm-models"),
      showWorkspace: () => setActiveSurface("workspace"),
    }),
    [activeSurface],
  );

  return (
    <WorkspaceSurfaceContext.Provider value={value}>
      {children}
    </WorkspaceSurfaceContext.Provider>
  );
}

export function useWorkspaceSurface() {
  const context = React.useContext(WorkspaceSurfaceContext);
  if (!context) {
    throw new Error("useWorkspaceSurface must be used within WorkspaceSurfaceProvider");
  }
  return context;
}
