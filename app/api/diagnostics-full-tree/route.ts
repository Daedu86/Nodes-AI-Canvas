import { generateText, type ModelMessage } from "ai";
import { createLanguageModel } from "@/lib/llm/provider-runtime";
import { chatRequestBodySchema, prepareChatRequest } from "@/lib/server/chat/request";
import { executeBranchSpec } from "@/lib/thread-branching-runtime";
import type { BranchSpec } from "@/lib/thread-branching";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sanitizeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}/g, "[redacted-token]")
    .slice(0, 240);

export async function GET() {
  const publicAppends: unknown[] = [];
  const internalAppends: unknown[] = [];
  const runtime = {
    append: (message: unknown) => publicAppends.push(message),
    __internal_threadBinding: {
      getState: () => ({
        append: (message: unknown) => internalAppends.push(message),
      }),
    },
  };
  const spec: BranchSpec = {
    operation: "create-follow-up-prompt",
    anchorId: "assistant-node-1",
    anchorRole: "assistant",
    parentId: "assistant-node-1",
    sourceId: "assistant-node-1",
    targetRole: "user",
    startRun: true,
    placeholder: "Continue this branch...",
    title: "Create follow-up message",
  };
  const prompt = "Cuales fueron todos los colores y animales? Responde solo con los dos colores y los dos animales mencionados.";
  const executed = executeBranchSpec(runtime as never, spec, {
    contextMessages: [
      { id: "u-root", role: "user", content: "Dame 2 frutas" },
      { id: "a-root", role: "assistant", content: "manzana y pera" },
      { id: "u-colors", role: "user", content: "Dame un color para cada fruta" },
      { id: "a-colors", role: "assistant", content: "rojo y verde" },
      { id: "u-animals", role: "user", content: "Dame un animal para cada fruta" },
      { id: "a-animals", role: "assistant", content: "mono y oso" },
      { id: "current-prompt", role: "user", content: prompt },
    ],
    contextScope: "tree",
    historyMode: "full",
    modelId: "openrouter/free",
    provider: "openrouter",
    requireContextScope: true,
    text: prompt,
  });

  const appended = publicAppends[0] as
    | { metadata?: Record<string, unknown>; runConfig?: { custom?: Record<string, unknown> } }
    | undefined;
  if (!executed || !appended) {
    return Response.json(
      { ok: false, error: "Non-root Full tree branch did not append through the public runtime." },
      { status: 500 },
    );
  }

  const parsed = chatRequestBodySchema.parse({
    messages: [
      {
        id: "current-prompt",
        role: "user",
        parts: [{ type: "text", text: prompt }],
        metadata: appended.metadata,
      },
    ],
  });
  const prepared = prepareChatRequest(parsed);
  const systemContext = prepared.messagesToSend[0]?.content ?? "";
  const currentPrompt = prepared.messagesToSend[1]?.content ?? "";
  const pipelineChecks = {
    executed,
    usedPublicAppend: publicAppends.length === 1,
    skippedInternalAppend: internalAppends.length === 0,
    treeOmittedFromRunConfig: appended.runConfig?.custom?.contextMessages === undefined,
    providerPayloadHasColorSibling: systemContext.includes("rojo y verde"),
    providerPayloadHasAnimalSibling: systemContext.includes("mono y oso"),
    providerPayloadMarksFullTree: systemContext.includes("full conversation tree"),
    providerPayloadHasCurrentPrompt: currentPrompt === prompt,
    resolvedOpenRouterModel:
      prepared.requestedModel.provider === "openrouter" &&
      prepared.requestedModel.modelId === "openrouter/free",
  };
  const pipelineOk = Object.values(pipelineChecks).every(Boolean);

  let providerText: string | null = null;
  let providerError: string | null = null;
  let providerUsedTreeFacts = false;
  try {
    const model = createLanguageModel(
      { provider: "openrouter", modelId: "openrouter/free" },
      {},
      { userPlan: "paid" },
    ) as Parameters<typeof generateText>[0]["model"];
    const messages = prepared.messagesToSend.map((message) => ({
      role: message.role,
      content: message.modelContent as string,
    })) as ModelMessage[];
    const result = await generateText({
      model,
      messages,
      maxOutputTokens: 80,
      abortSignal: AbortSignal.timeout(45_000),
    });
    providerText = result.text.trim();
    const normalized = providerText.toLocaleLowerCase("es");
    providerUsedTreeFacts = ["rojo", "verde", "mono", "oso"].every((term) =>
      normalized.includes(term),
    );
  } catch (error) {
    providerError = sanitizeError(error);
  }

  const ok = pipelineOk && providerUsedTreeFacts;
  return Response.json(
    {
      ok,
      pipelineChecks,
      providerTest: {
        attempted: true,
        responded: Boolean(providerText),
        usedTreeFacts: providerUsedTreeFacts,
        text: providerText,
        error: providerError,
      },
      messageRoles: prepared.messagesToSend.map((message) => message.role),
      messageCount: prepared.messagesToSend.length,
    },
    { status: ok ? 200 : 500 },
  );
}
