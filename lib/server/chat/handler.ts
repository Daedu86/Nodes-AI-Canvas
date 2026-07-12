import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import {
  createRequestErrorResponse,
} from "@/lib/llm/request-errors";
import { getUserModelOverrides } from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import {
  createLlmAuditContext,
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
    contextArtifactCount: request.contextArtifacts.length,
    historyMode: request.historyMode ?? null,
    requested: request.requestedModel,
    route: "/api/chat",
    user,
  });

  if (request.messagesToSend.length === 0) {
    return createEmptyChatResponse();
  }

  const [requestOverrides, userPlan] = await Promise.all([
    getUserModelOverrides(user.id),
    getUserPlan(user.id),
  ]);
  const quota = await reserveChatQuota(user.id, userPlan);
  if (!quota.ok) {
    logLlmAuditRejected(
      auditContext,
      quota.rejection.code,
      Date.now() - auditContext.startedAt,
    );
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

  logLlmAuditAccepted(auditContext);
  try {
    return await executeChatRequest({
      auditContext,
      quotaGrant: quota.grant,
      request,
      requestOverrides,
      userPlan,
    });
  } catch (error) {
    await quota.grant.release();
    console.error("Unexpected /api/chat orchestration error", error);
    logLlmAuditFailed(
      auditContext,
      request.requestedModel,
      "backend_unavailable",
      false,
      Date.now() - auditContext.startedAt,
    );
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
