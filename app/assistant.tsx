"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import dynamic from "next/dynamic";
import { LinkEditorProvider } from "@/components/context/link-editor";
import { LlmSettingsProvider, useLlmSettings } from "@/components/context/llm-settings";
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
import { WorkspaceSurfaceProvider, useWorkspaceSurface } from "@/components/context/workspace-surface";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/workspace/app-header";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { KnowledgeCenterWorkspace } from "@/components/workspace/knowledge-center-workspace";
import { LlmModelsWorkspace } from "@/components/workspace/llm-models-workspace";
import { AgentAccessWorkspace } from "@/components/workspace/agent-access-workspace";
import { AgentWorkWorkspace } from "@/components/workspace/agent-work-workspace";
import { PlanUsageWorkspace } from "@/components/workspace/plan-usage-workspace";
import { AdminUsersWorkspace } from "@/components/workspace/admin-users-workspace";
import { SupportWorkspace } from "@/components/workspace/support-workspace";
import { WorkspaceSplitLayout } from "@/components/workspace/workspace-split-layout";
import {
  getRequestErrorMessageFromResponse,
  getRequestErrorMessageFromThrowable,
} from "@/lib/llm/request-errors";
import { rememberMessageLatencyEntry } from "@/lib/message-latency-registry";
import { GraphBranchIntentProvider } from "@/components/context/graph-branch-intent";
import { clearPostAuthHandoff, hasPostAuthChatHandoff } from "@/lib/client/post-auth-handoff";

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

const BriefPanel = dynamic(
  () => import("@/components/workspace/brief-panel").then((mod) => mod.BriefPanel),
  {
    loading: () => (
      <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-border/60 bg-background p-4 text-sm text-muted-foreground">
        Loading brief…
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
  const { historyMode, modelConfig, setModelConfig } = useSessionUiState();
  const { getSupportedModelConfig, isReady: llmSettingsReady } = useLlmSettings();
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [latencyVersion, setLatencyVersion] = React.useState(0);
  const pendingLatencyRef = React.useRef<{ startedAt: number; responseStartedAt: number | null } | null>(null);

  React.useEffect(() => {
    setRequestError(null);
  }, [sessionId]);

  React.useEffect(() => {
    if (!llmSettingsReady) {
      return;
    }
    const normalized = getSupportedModelConfig(modelConfig);
    if (
      normalized.modelId === modelConfig.modelId &&
      normalized.provider === modelConfig.provider
    ) {
      return;
    }
    setModelConfig(normalized);
  }, [getSupportedModelConfig, llmSettingsReady, modelConfig, setModelConfig]);

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
        headers?: HeadersInit;
      }) => ({
        body: {
          ...(options.body ?? {}),
          ...chatRequestBody,
        },
        headers: Object.fromEntries(new Headers(options.headers ?? {}).entries()),
      }),
      onError: (error: Error) => {
        pendingLatencyRef.current = null;
        setRequestError(getRequestErrorMessageFromThrowable(error));
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
        setRequestError(getRequestErrorMessageFromResponse(response));
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
      setRequestError(null);
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
        setRequestError(null);
      } catch {
        pendingLatencyRef.current = null;
        setRequestError(null);
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
                      briefPanel={<BriefPanel />}
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

function WorkspaceLoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 py-10">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border/60 bg-background/80 px-6 py-5 text-center shadow-sm">
        <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">
          Loading your workspace context and preparing a session.
        </p>
      </div>
    </div>
  );
}

function AssistantRuntimeShell() {
  const { activeSessionId, isReady } = usePersistedSessions();

  React.useEffect(() => {
    if (!isReady || !activeSessionId || !hasPostAuthChatHandoff()) {
      return;
    }
    clearPostAuthHandoff();
  }, [activeSessionId, isReady]);

  if (!isReady || !activeSessionId) {
    return <WorkspaceLoadingState label="Opening your session…" />;
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
    return <WorkspaceLoadingState label="Opening your project…" />;
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
  const { activeSurface } = useWorkspaceSurface();

  if (!isReady) {
    return <WorkspaceLoadingState label="Preparing your workspace…" />;
  }

  if (activeSurface === "llm-models") {
    return <LlmModelsWorkspace />;
  }
  if (activeSurface === "plan-usage") {
    return <PlanUsageWorkspace />;
  }
  if (activeSurface === "knowledge-center") {
    return <KnowledgeCenterWorkspace />;
  }
  if (activeSurface === "agent-access") {
    return <AgentAccessWorkspace />;
  }
  if (activeSurface === "agent-work") {
    return <AgentWorkWorkspace />;
  }
  if (activeSurface === "admin-users") {
    return <AdminUsersWorkspace />;
  }
  if (activeSurface === "support") {
    return <SupportWorkspace />;
  }

  return activeProjectId ? <ProjectRuntimeShell /> : <AssistantRuntimeShell />;
}

export const Assistant = () => {
  return (
    <PersistedSessionsProvider>
      <ProjectsProvider>
        <ReusableMemoryProvider>
          <LlmSettingsProvider>
            <WorkspaceSurfaceProvider>
              <SidebarProvider className="h-svh w-full overflow-hidden">
                <AppSidebar />
                <SidebarInset className="min-h-0 overflow-hidden">
                  <WorkspaceShell />
                </SidebarInset>
              </SidebarProvider>
            </WorkspaceSurfaceProvider>
          </LlmSettingsProvider>
        </ReusableMemoryProvider>
      </ProjectsProvider>
    </PersistedSessionsProvider>
  );
};






