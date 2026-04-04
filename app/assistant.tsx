"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import dynamic from "next/dynamic";
import { LinkEditorProvider } from "@/components/context/link-editor";
import { MessageLatencyProvider } from "@/components/context/message-latency";
import { RequestErrorProvider } from "@/components/context/request-error";
import { SessionArtifactsProvider } from "@/components/context/session-artifacts";
import { ProjectsProvider, useProjects } from "@/components/context/projects";
import { ReusableMemoryProvider } from "@/components/context/reusable-memory";
import {
  PersistedSessionsProvider,
  usePersistedSessions,
} from "@/components/context/persisted-sessions";
import { PersistedSessionRuntimeBridge } from "@/components/context/persisted-session-runtime-bridge";
import React, { useMemo } from "react";
import { SessionUiStateProvider, useSessionUiState } from "@/components/context/session-ui-state";
import { NodyPanelProvider } from "@/components/context/nody-panel";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/workspace/app-header";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { WorkspaceSplitLayout } from "@/components/workspace/workspace-split-layout";
import { rememberMessageLatencyEntry } from "@/lib/message-latency-registry";
import { GraphBranchIntentProvider } from "@/components/context/graph-branch-intent";

const GraphPanel = dynamic(
  () => import("@/components/workspace/graph-panel").then((mod) => mod.GraphPanel),
  {
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-border/60 bg-background p-4 text-sm text-muted-foreground">
        Loading graph…
      </div>
    ),
    ssr: false,
  },
);

const NodyPanel = dynamic(
  () => import("@/components/workspace/nody-panel").then((mod) => mod.NodyPanel),
  {
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-border/60 bg-background p-4 text-sm text-muted-foreground">
        Loading Nody…
      </div>
    ),
    ssr: false,
  },
);

const WikiPanel = dynamic(
  () => import("@/components/workspace/wiki-panel").then((mod) => mod.WikiPanel),
  {
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-border/60 bg-background p-4 text-sm text-muted-foreground">
        Loading wiki…
      </div>
    ),
    ssr: false,
  },
);

const ProjectHeader = dynamic(
  () => import("@/components/workspace/project-header").then((mod) => mod.ProjectHeader),
  {
    loading: () => null,
  },
);

const ProjectWorkspace = dynamic(
  () => import("@/components/workspace/project-workspace").then((mod) => mod.ProjectWorkspace),
  {
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center p-6 text-sm text-muted-foreground">
        Loading project workspace…
      </div>
    ),
    ssr: false,
  },
);

function SessionBoundRuntime({ sessionId }: { sessionId: string }) {
  const { historyMode, modelConfig } = useSessionUiState();
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [latencyVersion, setLatencyVersion] = React.useState(0);
  const pendingLatencyRef = React.useRef<{ startedAt: number; responseStartedAt: number | null } | null>(null);

  React.useEffect(() => {
    setRequestError(null);
  }, [sessionId]);

  const recordPendingLatency = React.useCallback((messageId?: string | null) => {
    const pendingLatency = pendingLatencyRef.current;
    pendingLatencyRef.current = null;
    if (!pendingLatency?.startedAt || !messageId) {
      return;
    }
    const completedAt = performance.now();
    rememberMessageLatencyEntry(messageId, {
      responseStartMs:
        pendingLatency.responseStartedAt == null
          ? null
          : Math.max(0, pendingLatency.responseStartedAt - pendingLatency.startedAt),
      totalMs: Math.max(0, completedAt - pendingLatency.startedAt),
    });
    setLatencyVersion((value) => value + 1);
  }, []);

  const chatRequestBody = useMemo(
    () => ({
      historyMode,
      model: modelConfig.modelId,
      provider: modelConfig.provider,
    }),
    [historyMode, modelConfig.modelId, modelConfig.provider],
  );
  const chatRuntimeOptions = useMemo(
    () => ({
      api: "/api/chat",
      body: chatRequestBody,
      prepareSendMessagesRequest: (options: {
        body?: Record<string, unknown>;
      }) => ({
        body: {
          ...(options.body ?? {}),
          ...chatRequestBody,
        },
      }),
      onError: () => {
        pendingLatencyRef.current = null;
        setRequestError("Assistant request failed. Check the selected model or provider and try again.");
      },
      onResponse: (response: Response) => {
        if (response.ok) {
          if (pendingLatencyRef.current && pendingLatencyRef.current.responseStartedAt == null) {
            pendingLatencyRef.current = {
              ...pendingLatencyRef.current,
              responseStartedAt: performance.now(),
            };
          }
          setRequestError(null);
          return;
        }
        pendingLatencyRef.current = null;
        setRequestError("Assistant request failed. Check the selected model or provider and try again.");
      },
      onFinish: ({ message }: { message?: { id?: string } }) => {
        recordPendingLatency(message?.id);
      },
    }),
    [chatRequestBody, recordPendingLatency],
  );

  const rawRuntime = useChatRuntime(chatRuntimeOptions);

  React.useEffect(() => {
    if (!rawRuntime) return;
    const thread = rawRuntime.threads.main;
    const onRunStart = thread.unstable_on("runStart", () => {
      pendingLatencyRef.current = {
        startedAt: performance.now(),
        responseStartedAt: null,
      };
    });
    const onRunEnd = thread.unstable_on("runEnd", () => {
      try {
        const exported = thread.export();
        const messages = Array.isArray(exported?.messages) ? exported.messages : [];
        const lastAssistant = [...messages]
          .reverse()
          .find((entry) => {
            const message = entry?.message as { id?: unknown; role?: unknown } | undefined;
            return typeof message?.id === "string" && message.role === "assistant";
          });
        const messageId =
          typeof (lastAssistant?.message as { id?: unknown } | undefined)?.id === "string"
            ? ((lastAssistant?.message as { id: string }).id)
            : null;
        recordPendingLatency(messageId);
      } catch {
        pendingLatencyRef.current = null;
      }
    });
    return () => {
      onRunStart();
      onRunEnd();
    };
  }, [rawRuntime, recordPendingLatency]);

  if (!rawRuntime) {
    return null;
  }

  return (
    <AssistantRuntimeProvider runtime={rawRuntime}>
      <PersistedSessionRuntimeBridge />
      <RequestErrorProvider
        value={{
          clearRequestError: () => setRequestError(null),
          requestError,
          setRequestError,
        }}
      >
        <MessageLatencyProvider
          value={{
            bumpLatencyVersion: () => setLatencyVersion((value) => value + 1),
            latencyVersion,
          }}
        >
          <NodyPanelProvider>
            <SessionArtifactsProvider>
              <GraphBranchIntentProvider>
                <LinkEditorProvider>
                  <>
                    <AppHeader />
                    <WorkspaceSplitLayout
                      chatPanel={<ChatPanel />}
                      canvasPanel={<GraphPanel />}
                      wikiPanel={<WikiPanel />}
                      nodyPanel={<NodyPanel />}
                    />
                  </>
                </LinkEditorProvider>
              </GraphBranchIntentProvider>
            </SessionArtifactsProvider>
          </NodyPanelProvider>
        </MessageLatencyProvider>
      </RequestErrorProvider>
    </AssistantRuntimeProvider>
  );
}

function AssistantRuntimeShell() {
  const { activeSessionId, isReady } = usePersistedSessions();

  if (!isReady || !activeSessionId) {
    return null;
  }

  return (
    <SessionUiStateProvider key={activeSessionId} sessionId={activeSessionId}>
      <SessionBoundRuntime key={activeSessionId} sessionId={activeSessionId} />
    </SessionUiStateProvider>
  );
}

function ProjectRuntimeShell() {
  const { activeProjectId, isReady } = useProjects();

  if (!isReady || !activeProjectId) {
    return null;
  }

  return (
    <>
      <ProjectHeader />
      <ProjectWorkspace />
    </>
  );
}

function WorkspaceShell() {
  const { activeProjectId, isReady } = useProjects();

  if (!isReady) {
    return null;
  }

  return activeProjectId ? <ProjectRuntimeShell /> : <AssistantRuntimeShell />;
}

export const Assistant = () => {
  return (
    <PersistedSessionsProvider>
      <ProjectsProvider>
        <ReusableMemoryProvider>
          <SidebarProvider className="h-svh w-full overflow-hidden">
            <AppSidebar />
            <SidebarInset className="min-h-0 overflow-hidden">
              <WorkspaceShell />
            </SidebarInset>
          </SidebarProvider>
        </ReusableMemoryProvider>
      </ProjectsProvider>
    </PersistedSessionsProvider>
  );
};






