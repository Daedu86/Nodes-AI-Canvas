import { NextResponse } from "next/server";
import { generateText, type ModelMessage } from "ai";
import type { Provider } from "@/lib/llm/config";
import { resolveModelConfig } from "@/lib/llm/config";
import { getMissingProviderCredential, getUserModelOverrides, createLanguageModel } from "@/lib/llm/provider-runtime";
import { normalizeMessages, selectMessagesForHistoryMode } from "@/lib/llm/messages";
import { classifyRequestError } from "@/lib/llm/request-errors";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import { recordAgentEvent } from "@/lib/server/agent-work";
import { getSession, patchSession } from "@/lib/session-store";
import { normalizeSessionThreadExport, type SessionThreadExport } from "@/lib/session-documents";
import { getUserPlan } from "@/lib/user-plan-store";

export const runtime = "nodejs";
export const maxDuration = 60;

type AgentChatRequestBody = {
  sessionId?: string;
  prompt?: string;
  system?: string;
  historyMode?: string;
  model?: string;
  provider?: Provider;
};

type PersistedMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: Array<{ type: "text"; text: string }>;
  metadata?: Record<string, unknown>;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildTextMessage = (role: PersistedMessage["role"], text: string, metadata?: Record<string, unknown>): PersistedMessage => ({
  id: crypto.randomUUID(),
  role,
  content: [{ type: "text", text }],
  ...(metadata ? { metadata } : {}),
});

const appendToSnapshot = (
  snapshot: SessionThreadExport,
  message: PersistedMessage,
): SessionThreadExport => ({
  headId: message.id,
  messages: [
    ...snapshot.messages,
    {
      parentId: snapshot.headId ?? null,
      message: message as unknown as Record<string, unknown>,
    },
  ],
});

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  const body = (await req.json().catch(() => ({}))) as AgentChatRequestBody;
  const sessionId = isNonEmptyString(body.sessionId) ? body.sessionId.trim() : null;
  const prompt = isNonEmptyString(body.prompt) ? body.prompt.trim() : null;

  if (!sessionId || !prompt) {
    return NextResponse.json({ error: "Missing sessionId or prompt." }, { status: 400 });
  }

  const actor = {
    tokenId: guarded.user.agentTokenId ?? null,
    label: guarded.user.agentLabel ?? null,
    ownerId: guarded.user.id,
  };

  let session: Awaited<ReturnType<typeof getSession>> | null = null;
  try {
    session = await getSession(sessionId, guarded.user.id);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const userPlan = await getUserPlan(guarded.user.id);
  const quota = await reserveChatQuota(guarded.user.id, userPlan);
  if (!quota.ok) {
    await recordAgentEvent({
      actor,
      eventType: "chat.rejected",
      method: "POST",
      route: "/api/agents/chat",
      sessionId,
      payload: { code: quota.rejection.code },
    });
    const headers = new Headers(quota.rejection.headers);
    return NextResponse.json({ error: quota.rejection.message, code: quota.rejection.code }, { status: quota.rejection.status, headers });
  }

  const requestOverrides = await getUserModelOverrides(guarded.user.id);
  const { modelId, provider } = resolveModelConfig({ model: body.model, provider: body.provider });
  const missingCredential = getMissingProviderCredential(provider, requestOverrides, { userPlan });
  if (missingCredential) {
    quota.grant.release();
    await recordAgentEvent({
      actor,
      eventType: "chat.failed",
      method: "POST",
      route: "/api/agents/chat",
      sessionId,
      payload: { code: missingCredential.code, provider },
    });
    return NextResponse.json({ error: missingCredential.message, code: missingCredential.code }, { status: missingCredential.status });
  }

  const model = createLanguageModel({ modelId, provider }, requestOverrides, {
    userPlan,
  }) as Parameters<typeof generateText>[0]["model"];

  const baseSnapshot = normalizeSessionThreadExport(session.snapshot);
  const userMessage = buildTextMessage("user", prompt, {
    custom: {
      via: actor.tokenId ? "agent-token" : "user",
      requestedModel: modelId,
      requestedProvider: provider,
    },
  });
  const snapshotWithUser = appendToSnapshot(baseSnapshot, userMessage);

  // Persist the prompt immediately so it doesn't get lost if the provider fails mid-run.
  try {
    await patchSession(sessionId, { snapshot: snapshotWithUser }, guarded.user.id);
  } catch {
    quota.grant.release();
    return NextResponse.json({ error: "Unable to persist session prompt." }, { status: 500 });
  }

  await recordAgentEvent({
    actor,
    eventType: "chat.started",
    method: "POST",
    route: "/api/agents/chat",
    sessionId,
    payload: { provider, modelId },
  });

  try {
    const normalized = normalizeMessages(snapshotWithUser.messages.map((entry) => entry.message));
    const selected = selectMessagesForHistoryMode(normalized, body.historyMode);
    const modelMessages = selected.map(
      (message) => {
        if (message.role === "assistant") {
          return { role: "assistant", content: message.modelContent as string } satisfies ModelMessage;
        }
        if (message.role === "system") {
          return { role: "system", content: message.modelContent as string } satisfies ModelMessage;
        }
        return { role: "user", content: message.modelContent } satisfies ModelMessage;
      },
    );

    const result = await generateText({
      model,
      messages: modelMessages,
      system: isNonEmptyString(body.system) ? body.system.trim() : undefined,
    });

    const assistantMessage = buildTextMessage("assistant", result.text, {
      custom: {
        via: actor.tokenId ? "agent-token" : "user",
        resolvedModel: modelId,
        resolvedProvider: provider,
      },
    });

    const nextSnapshot: SessionThreadExport = {
      headId: assistantMessage.id,
      messages: [
        ...snapshotWithUser.messages,
        {
          parentId: userMessage.id,
          message: assistantMessage as unknown as Record<string, unknown>,
        },
      ],
    };

    await patchSession(sessionId, { snapshot: nextSnapshot }, guarded.user.id);

    await recordAgentEvent({
      actor,
      eventType: "chat.completed",
      method: "POST",
      route: "/api/agents/chat",
      sessionId,
      payload: { provider, modelId },
    });

    return NextResponse.json({
      sessionId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      text: result.text,
      resolved: { provider, modelId },
    });
  } catch (error) {
    const classified = classifyRequestError(error, { provider, modelId });
    await recordAgentEvent({
      actor,
      eventType: "chat.failed",
      method: "POST",
      route: "/api/agents/chat",
      sessionId,
      payload: { provider, modelId, code: classified.code, status: classified.status },
    });
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status });
  } finally {
    quota.grant.release();
  }
}
