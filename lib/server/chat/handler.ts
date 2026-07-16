import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createRequestErrorResponse } from "@/lib/llm/request-errors";
import { getUserModelOverrides } from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import {
  createLlmAuditContext,
  getSafeErrorName,
  logLlmAuditAccepted,
  logLlmAuditFailed,
  logLlmAuditRejected,
} from "@/lib/server/llm-audit";
import type { AuthenticatedUser } from "@/lib/server/auth-user";
import { executeChatRequest } from "@/lib/server/chat/executor";
import {
  CHAT_REQUEST_ID_HEADER,
  parseChatRequest,
  prepareChatRequest,
} from "@/lib/server/chat/request";
import { getUserPlan } from "@/lib/user-plan-store";

const createEmptyChatResponse = () => {
  const stream = createUIMessageStream({
    execute() {},
  });
  return createUIMessageStreamResponse({ stream });
};

const getContentLength = (content: unknown) => {
  if (typeof content === "string") return content.length;
  try {
    return JSON.stringify(content).length;
  } catch {
    return null;
  }
};

export async function handleChatPost(
  req: Request,
  user: AuthenticatedUser,
): Promise<Response> {
  const parsed = await parseChatRequest(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const request = prepareChatRequest(parsed.body);
  const auditContext = createLlmAuditContext({
    actorType: user.isAgent ? "agent" : "user",
    contextArtifactCount: request.contextArtifacts.length,
    historyMode: request.historyMode ?? null,
    messageCount: request.messages.length,
    requested: request.requestedModel,
    route: "/api/chat",
    sentMessageCount: request.messagesToSend.length,
    toolCount: Object.keys(request.tools ?? {}).length,
  });

  console.info(
    "[nodes-chat-shape]",
    JSON.stringify({
      contextScope:
        request.body.metadata?.custom?.contextScope ??
        request.body.runConfig?.custom?.contextScope ??
        null,
      event: "chat_message_shape",
      historyMode: request.historyMode ?? null,
      requestId: auditContext.requestId,
      roles: request.messagesToSend.map((message) => message.role),
      contentLengths: request.messagesToSend.map((message) =>
        getContentLength(message.modelContent),
      ),
      source: "nodes-llm-observability",
    }),
  );

  if (request.messagesToSend.length === 0) {
    return createEmptyChatResponse();
  }

  const [requestOverrides, userPlan] = await Promise.all([
    getUserModelOverrides(user.id),
    getUserPlan(user.id),
  ]);
  const quota = await reserveChatQuota(user.id, userPlan);
  if (!quota.ok) {
    logLlmAuditRejected(auditContext, {
      durationMs: Date.now() - auditContext.startedAt,
      errorCode: quota.rejection.code,
      quota: quota.rejection.metrics,
    });
    return createRequestErrorResponse({
      code: quota.rejection.code,
      headers: {
        [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
        ...Object.fromEntries(quota.rejection.headers.entries()),
      },
      message: quota.rejection.message,
      status: quota.rejection.status,
    });
  }

  logLlmAuditAccepted(auditContext, { quota: quota.grant.metrics });
  try {
    return await executeChatRequest({
      abortSignal: req.signal,
      auditContext,
      quotaGrant: quota.grant,
      request,
      requestOverrides,
      userPlan,
    });
  } catch (error) {
    await quota.grant.release();
    const durationMs = Date.now() - auditContext.startedAt;
    console.error(
      JSON.stringify({
        errorName: getSafeErrorName(error),
        event: "chat_orchestration_failed",
        requestId: auditContext.requestId,
        source: "nodes-llm-observability",
      }),
    );
    logLlmAuditFailed(auditContext, request.requestedModel, {
      attemptCount: 0,
      errorCode: "backend_unavailable",
      fallbackApplied: false,
      timing: {
        durationMs,
        providerDurationMs: durationMs,
        providerTimeToFirstChunkMs: null,
        providerTimeToFirstTokenMs: null,
        timeToFirstChunkMs: null,
        timeToFirstTokenMs: null,
      },
    });
    return createRequestErrorResponse({
      code: "backend_unavailable",
      headers: {
        [CHAT_REQUEST_ID_HEADER]: auditContext.requestId,
        ...Object.fromEntries(quota.grant.headers.entries()),
      },
      message:
        "The assistant backend is unavailable right now. Try again in a moment.",
      status: 503,
    });
  }
}
