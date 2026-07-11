
"use strict";

import { generateText, type ModelMessage } from "ai";
import {
  getModelAttemptChain,
  getRequestedModelConfig,
  resolveModelConfig,
  type Provider,
  type ResolvedModelConfig,
} from "@/lib/llm/config";
import { buildContextArtifactsUserMessage } from "@/lib/llm/context-builder";
import { isE2eMockLlmEnabled } from "@/lib/llm/e2e-mock";
import {
  classifyRequestError,
  createRequestErrorResponse,
  createResolvedModelHeaders,
} from "@/lib/llm/request-errors";
import {
  createLanguageModel,
  getMissingProviderCredential,
  getUserModelOverrides,
} from "@/lib/llm/provider-runtime";
import { reserveChatQuota } from "@/lib/server/chat-governor";
import {
  createLlmAuditContext,
  logLlmAuditAccepted,
  logLlmAuditCompleted,
  logLlmAuditFailed,
  logLlmAuditRejected,
} from "@/lib/server/llm-audit";
import { requireLocalApiUser } from "@/lib/server/request-guards";
import {
  getOutputFormatInstruction,
  normalizeLlmContextArtifacts,
  type SessionArtifactSemanticType,
} from "@/lib/session-artifacts";
import { getUserPlan } from "@/lib/user-plan-store";

export const runtime = "nodejs";
export const maxDuration = 60;
const REQUEST_ID_HEADER = "x-nodes-request-id";

type CanvasRunRequestBody = {
  contextArtifacts?: unknown;
  model?: string;
  outputArtifactTypes?: unknown;
  prompt?: string;
  promptId?: string;
  provider?: Provider;
  runId?: string;
  system?: string;
};

const isFreeCanvasModel = (config: ResolvedModelConfig) =>
  config.provider === "ollama" ||
  config.modelId === "openrouter/free" ||
  config.modelId.endsWith(":free");

const normalizeOutputTypes = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is SessionArtifactSemanticType =>
          entry === "decision" ||
          entry === "evidence" ||
          entry === "plan" ||
          entry === "table" ||
          entry === "question" ||
          entry === "draft",
      )
    : [];

export async function POST(req: Request) {
  const guarded = await requireLocalApiUser(req);
  if ("response" in guarded) return guarded.response;

  let body: CanvasRunRequestBody;
  try {
    body = (await req.json()) as CanvasRunRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "A canvas prompt is required." }, { status: 400 });
  }

  const contextArtifacts = normalizeLlmContextArtifacts(body.contextArtifacts);
  const outputArtifactTypes = normalizeOutputTypes(body.outputArtifactTypes);
  const formattingInstruction = getOutputFormatInstruction(outputArtifactTypes);
  const promptText = `${prompt}${formattingInstruction}`;
  const requestOverrides = await getUserModelOverrides(guarded.user.id);
  const userPlan = await getUserPlan(guarded.user.id);
  const requestedModel = getRequestedModelConfig(body);
  const primaryModel = resolveModelConfig(body);
  const attempts = getModelAttemptChain(primaryModel).filter(isFreeCanvasModel);
  const auditContext = createLlmAuditContext({
    contextArtifactCount: contextArtifacts.length,
    historyMode: "canvas-independent",
    requested: requestedModel,
    route: "/api/canvas-runs",
    user: guarded.user,
  });

  if (attempts.length === 0) {
    return Response.json(
      { error: "Canvas runs are restricted to free-tier or local models." },
      { status: 400 },
    );
  }

  const quota = await reserveChatQuota(guarded.user.id, userPlan);
  if (!quota.ok) {
    logLlmAuditRejected(
      auditContext,
      quota.rejection.code,
      Date.now() - auditContext.startedAt,
    );
    return createRequestErrorResponse({
      code: quota.rejection.code,
      headers: {
        [REQUEST_ID_HEADER]: auditContext.requestId,
        ...Object.fromEntries(quota.rejection.headers.entries()),
      },
      message: quota.rejection.message,
      status: quota.rejection.status,
    });
  }

  logLlmAuditAccepted(auditContext);

  if (isE2eMockLlmEnabled()) {
    const resolved = attempts[0]!;
    quota.grant.release();
    logLlmAuditCompleted(auditContext, resolved);
    const headers = new Headers(createResolvedModelHeaders({ resolved, fallbackApplied: false }));
    headers.set(REQUEST_ID_HEADER, auditContext.requestId);
    quota.grant.headers.forEach((value, key) => headers.set(key, value));
    return Response.json(
      {
        modelId: resolved.modelId,
        promptId: body.promptId ?? null,
        provider: resolved.provider,
        runId: body.runId ?? null,
        text: `Mock canvas response: ${prompt}`,
      },
      { headers },
    );
  }

  let lastError: ReturnType<typeof classifyRequestError> | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const currentModel = attempts[index]!;
    const fallbackApplied =
      index > 0 ||
      currentModel.modelId !== requestedModel.modelId ||
      currentModel.provider !== requestedModel.provider;
    const missingCredential = getMissingProviderCredential(currentModel.provider, requestOverrides, {
      userPlan,
    });
    if (missingCredential) {
      quota.grant.release();
      logLlmAuditFailed(
        auditContext,
        currentModel,
        missingCredential.code,
        fallbackApplied,
        Date.now() - auditContext.startedAt,
      );
      return createRequestErrorResponse({
        code: missingCredential.code,
        headers: { [REQUEST_ID_HEADER]: auditContext.requestId },
        message: missingCredential.message,
        status: missingCredential.status,
      });
    }

    try {
      const model = createLanguageModel(currentModel, requestOverrides, { userPlan }) as Parameters<
        typeof generateText
      >[0]["model"];
      const artifactContextMessage = buildContextArtifactsUserMessage(contextArtifacts, {
        modelId: currentModel.modelId,
        provider: currentModel.provider,
      });
      const messages: ModelMessage[] = [
        ...(artifactContextMessage ? [artifactContextMessage satisfies ModelMessage] : []),
        { role: "user", content: promptText },
      ];
      const result = await generateText({
        abortSignal: req.signal,
        messages,
        model,
        system: body.system,
        timeout: currentModel.provider === "openrouter" ? 45_000 : 30_000,
      });
      quota.grant.release();
      logLlmAuditCompleted(auditContext, currentModel, {
        fallbackApplied,
        totalTokens: result.usage?.totalTokens ?? null,
      });
      const headers = new Headers(
        createResolvedModelHeaders({ resolved: currentModel, fallbackApplied }),
      );
      headers.set(REQUEST_ID_HEADER, auditContext.requestId);
      quota.grant.headers.forEach((value, key) => headers.set(key, value));
      return Response.json(
        {
          modelId: currentModel.modelId,
          promptId: body.promptId ?? null,
          provider: currentModel.provider,
          runId: body.runId ?? null,
          text: result.text,
        },
        { headers },
      );
    } catch (error) {
      const classified = classifyRequestError(error, currentModel);
      lastError = classified;
      const hasFallback = index < attempts.length - 1;
      const shouldRetry =
        currentModel.provider === "openrouter" &&
        hasFallback &&
        (classified.code === "model_unavailable" ||
          classified.code === "provider_rate_limited" ||
          classified.code === "provider_unavailable");
      if (shouldRetry) continue;
      break;
    }
  }

  quota.grant.release();
  const failure =
    lastError ??
    ({
      code: "backend_unavailable",
      message: "No free-tier canvas model is currently available.",
      status: 503,
    } as const);
  logLlmAuditFailed(
    auditContext,
    primaryModel,
    failure.code,
    primaryModel.modelId !== requestedModel.modelId || primaryModel.provider !== requestedModel.provider,
    Date.now() - auditContext.startedAt,
  );
  return createRequestErrorResponse({
    ...failure,
    headers: {
      [REQUEST_ID_HEADER]: auditContext.requestId,
      ...Object.fromEntries(quota.grant.headers.entries()),
    },
  });
}
