"use client";

import type { ThreadRuntime } from "@assistant-ui/react";
import type { HistoryMode, ModelProvider } from "@/components/context/session-ui-state";
import {
  ASSISTANT_EDIT_METADATA_KEY,
  EDIT_PARENT_KEY,
  EDIT_SOURCE_KEY,
} from "@/lib/assistant-edit-branching";
import { ensureThreadIdle } from "@/lib/thread-run-control";

type AssistantEditRuntime = Pick<
  ThreadRuntime,
  "append" | "cancelRun" | "export" | "import" | "unstable_on"
>;

type ExecuteAssistantEditBranchOptions = {
  historyMode: HistoryMode;
  modelId: string;
  parentId: string | null;
  provider: ModelProvider;
  sourceId: string;
  text: string;
};

const FORCE_PERSIST_EVENT = "assistant-ui:force-persist-session";

const mergeExportedRepositories = (
  previousExport: ReturnType<ThreadRuntime["export"]>,
  currentExport: ReturnType<ThreadRuntime["export"]>,
) => {
  const orderedIds: string[] = [];
  const byId = new Map<string, (typeof currentExport.messages)[number]>();

  previousExport.messages.forEach((entry) => {
    const id = entry.message?.id;
    if (!id || byId.has(id)) return;
    orderedIds.push(id);
    byId.set(id, entry);
  });

  currentExport.messages.forEach((entry) => {
    const id = entry.message?.id;
    if (!id) return;
    if (!byId.has(id)) {
      orderedIds.push(id);
    }
    byId.set(id, entry);
  });

  return {
    headId: currentExport.headId,
    messages: orderedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is (typeof currentExport.messages)[number] => Boolean(entry)),
  };
};

export const executeAssistantEditBranch = async (
  threadRuntime: AssistantEditRuntime & Pick<ThreadRuntime, "getState">,
  options: ExecuteAssistantEditBranchOptions,
) => {
  const trimmedText = options.text.trim();
  if (!trimmedText || !options.parentId) {
    return false;
  }

  const threadReady = await ensureThreadIdle(threadRuntime);
  if (!threadReady) {
    return false;
  }

  const previousExport = threadRuntime.export();
  const hasParent = previousExport.messages.some(
    (entry) => entry.message?.id === options.parentId,
  );
  if (!hasParent) {
    return false;
  }

  let handledRunEnd = false;
  const unsubscribeRunEnd = threadRuntime.unstable_on("runEnd", () => {
    if (handledRunEnd) return;
    handledRunEnd = true;
    unsubscribeRunEnd();
    window.setTimeout(() => {
      try {
        const currentExport = threadRuntime.export();
        threadRuntime.import(mergeExportedRepositories(previousExport, currentExport));
        window.dispatchEvent(new CustomEvent(FORCE_PERSIST_EVENT));
      } catch {
        // ignore merge failures and keep the current branch visible
      }
    }, 0);
  });

  try {
    await threadRuntime.append({
      parentId: options.parentId,
      sourceId: options.sourceId,
      role: "user",
      content: [{ type: "text", text: trimmedText }],
      metadata: {
        custom: {
          branchAnchorId: options.sourceId,
          branchAnchorRole: "assistant",
          branchOperation: "assistant-edit",
          [ASSISTANT_EDIT_METADATA_KEY]: options.sourceId,
          [EDIT_PARENT_KEY]: options.parentId,
          [EDIT_SOURCE_KEY]: options.sourceId,
        },
      },
      runConfig: {
        custom: {
          historyMode: options.historyMode,
          model: options.modelId,
          provider: options.provider,
        },
      },
      startRun: true,
    });
  } catch (error) {
    unsubscribeRunEnd();
    throw error;
  }

  return true;
};
