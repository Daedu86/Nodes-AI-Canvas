import type { MessageFormatRepository } from "@assistant-ui/core";
import type { UIMessage } from "ai";
import {
  appendCompletedCanvasBranch,
  buildCanvasBranchRunRequest,
  buildCanvasBranchSystemContext,
} from "@/lib/canvas-branch-direct-run";
import { buildBranchAppendMessage } from "@/lib/thread-branching-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const parentPrompt = "Dame una palabra por letra";
  const parentSystem = buildCanvasBranchSystemContext(
    [
      {
        role: "user",
        content: "Continue from the saved assistant response below",
      },
      { role: "assistant", content: "A y B" },
      { role: "user", content: parentPrompt },
    ],
    "parent",
    parentPrompt,
  );

  const branchPrompt = "Resume la rama";
  const branchSystem = buildCanvasBranchSystemContext(
    [
      { id: "u-root", role: "user", content: "Dame 2 frutas" },
      { id: "a-root", role: "assistant", content: "manzana y pera" },
      { id: "u-animal", role: "user", content: "Dame animales" },
      { id: "a-animal", role: "assistant", content: "mono y oso" },
      { role: "user", content: branchPrompt },
    ],
    "branch",
    branchPrompt,
  );

  const fullTreePrompt = "¿Cuáles fueron todos los colores y animales?";
  const treeContext = [
    { id: "u-root", role: "user" as const, content: "Dame 2 frutas" },
    { id: "a-root", role: "assistant" as const, content: "manzana y pera" },
    { id: "u-color", role: "user" as const, content: "Dame colores" },
    { id: "a-color", role: "assistant" as const, content: "rojo y verde" },
    { id: "u-animal", role: "user" as const, content: "Dame animales" },
    { id: "a-animal", role: "assistant" as const, content: "mono y oso" },
    { role: "user" as const, content: fullTreePrompt },
  ];
  const treeSystem = buildCanvasBranchSystemContext(
    treeContext,
    "tree",
    fullTreePrompt,
  );

  const userMessage = buildBranchAppendMessage(
    {
      operation: "create-follow-up-prompt",
      anchorId: "a-root",
      anchorRole: "assistant",
      parentId: "a-root",
      sourceId: "a-root",
      targetRole: "user",
      startRun: true,
      placeholder: "Continue",
      title: "Follow up",
    },
    {
      contextMessages: treeContext,
      contextScope: "tree",
      historyMode: "full",
      modelId: "openrouter/free",
      provider: "openrouter",
      requireContextScope: true,
      text: fullTreePrompt,
    },
  );

  if (!userMessage) {
    return Response.json(
      { ok: false, error: "Could not build branch user message." },
      { status: 500 },
    );
  }

  const request = buildCanvasBranchRunRequest({
    contextMessages: treeContext,
    contextScope: "tree",
    model: "openrouter/free",
    outputArtifactTypes: [],
    prompt: fullTreePrompt,
    promptId: userMessage.id,
    provider: "openrouter",
    runId: "diagnostic-response",
  });

  const externalState: MessageFormatRepository<UIMessage> = {
    headId: "a-root",
    messages: [
      {
        parentId: null,
        message: {
          id: "u-root",
          role: "user",
          parts: [{ type: "text", text: "Dame 2 frutas" }],
        },
      },
      {
        parentId: "u-root",
        message: {
          id: "a-root",
          role: "assistant",
          parts: [{ type: "text", text: "manzana y pera" }],
        },
      },
    ],
  };

  const completed = appendCompletedCanvasBranch({
    externalState,
    modelId: "openrouter/free",
    provider: "openrouter",
    responseId: "diagnostic-response",
    responseText: "Los colores fueron rojo y verde; los animales, mono y oso.",
    userMessage,
  });
  const promptEntry = completed.messages.find(
    (entry) => entry.message.id === userMessage.id,
  );
  const responseEntry = completed.messages.find(
    (entry) => entry.message.id === "diagnostic-response",
  );

  const checks = {
    parentHasAssistantFact: parentSystem?.includes("A y B") === true,
    parentDoesNotDuplicatePrompt: parentSystem?.includes(parentPrompt) === false,
    branchHasRootFact: branchSystem?.includes("manzana y pera") === true,
    branchHasLineageFact: branchSystem?.includes("mono y oso") === true,
    branchDoesNotDuplicatePrompt: branchSystem?.includes(branchPrompt) === false,
    fullTreeHasColorSibling: treeSystem?.includes("rojo y verde") === true,
    fullTreeHasAnimalSibling: treeSystem?.includes("mono y oso") === true,
    fullTreeDoesNotDuplicatePrompt: treeSystem?.includes(fullTreePrompt) === false,
    requestCarriesFullTreeSystem:
      request.contextScope === "tree" &&
      request.system?.includes("rojo y verde") === true &&
      request.system?.includes("mono y oso") === true,
    branchPromptAttachedToAnchor: promptEntry?.parentId === "a-root",
    assistantAttachedToBranchPrompt: responseEntry?.parentId === userMessage.id,
    completedBranchBecomesHead: completed.headId === "diagnostic-response",
  };

  const ok = Object.values(checks).every(Boolean);
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
