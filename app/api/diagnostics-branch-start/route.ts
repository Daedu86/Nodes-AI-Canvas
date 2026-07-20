import type { BranchSpec } from "@/lib/thread-branching";
import { executeBranchSpec } from "@/lib/thread-branching-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicAppends: Array<Record<string, unknown>> = [];
  const internalAppends: Array<Record<string, unknown>> = [];
  const startRuns: Array<Record<string, unknown>> = [];

  const runtime = {
    append: (message: Record<string, unknown>) => publicAppends.push(message),
    startRun: (config: Record<string, unknown>) => startRuns.push(config),
    __internal_threadBinding: {
      getState: () => ({
        append: (message: Record<string, unknown>) => internalAppends.push(message),
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

  const executed = executeBranchSpec(runtime as never, spec, {
    contextMessages: [
      { id: "u-root", role: "user", content: "Dame 2 frutas" },
      { id: "a-root", role: "assistant", content: "manzana y pera" },
      { id: "u-colors", role: "user", content: "Dame un color para cada fruta" },
      { id: "a-colors", role: "assistant", content: "rojo y verde" },
      { id: "u-animals", role: "user", content: "Dame un animal para cada fruta" },
      { id: "a-animals", role: "assistant", content: "mono y oso" },
      { id: "current-prompt", role: "user", content: "Cuales fueron todos los colores y animales?" },
    ],
    contextScope: "tree",
    historyMode: "full",
    modelId: "openrouter/free",
    provider: "openrouter",
    requireContextScope: true,
    text: "Cuales fueron todos los colores y animales?",
  });

  const appended = publicAppends[0] as {
    id?: unknown;
    startRun?: unknown;
    metadata?: { custom?: Record<string, unknown> };
    runConfig?: unknown;
  } | undefined;
  const started = startRuns[0] as {
    parentId?: unknown;
    sourceId?: unknown;
    runConfig?: unknown;
  } | undefined;
  const durableContext = appended?.metadata?.custom?.contextMessages;
  const durableText = JSON.stringify(durableContext ?? []);
  const liveRunConfig = appended?.runConfig as { custom?: Record<string, unknown> } | undefined;

  const checks = {
    executed,
    publicAppendExactlyOnce: publicAppends.length === 1,
    internalAppendSkipped: internalAppends.length === 0,
    appendAutoRunDisabled: appended?.startRun === false,
    appendedMessageHasStableId: typeof appended?.id === "string" && appended.id.length > 0,
    explicitStartRunExactlyOnce: startRuns.length === 1,
    startRunTargetsAppendedPrompt: started?.parentId === appended?.id,
    startRunPreservesSource: started?.sourceId === "assistant-node-1",
    startRunPreservesRunConfig: started?.runConfig === appended?.runConfig,
    durableTreeContainsColorSibling: durableText.includes("rojo y verde"),
    durableTreeContainsAnimalSibling: durableText.includes("mono y oso"),
    treeContextOmittedFromLiveRunConfig:
      liveRunConfig?.custom?.contextMessages === undefined,
    fullTreeScopePreserved:
      liveRunConfig?.custom?.contextScope === "tree" &&
      liveRunConfig?.custom?.historyMode === "full",
  };

  const ok = Object.values(checks).every(Boolean);
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
