"use client";

import { useAssistantRuntime } from "@assistant-ui/react";
import type { MessageFormatRepository } from "@assistant-ui/core";
import type { UIMessage } from "ai";
import React from "react";
import {
  collectVisibleExternalMessageChain,
  orderThreadSnapshotForImport,
  repairExternalStateFromVisibleBranch,
  repairThreadSnapshotFromVisibleBranch,
} from "@/components/assistant-ui/thread-graph-flow/use-canvas-branch-submission";
import { usePersistedSessions } from "@/components/context/persisted-sessions";
import { useRequestError } from "@/components/context/request-error";
import { useSessionArtifacts } from "@/components/context/session-artifacts";
import { useSessionUiState } from "@/components/context/session-ui-state";
import type { SessionThreadExport } from "@/lib/session-documents";
import {
  forceSessionPersist,
  notifySessionRuntimeReplaced,
  resumeSessionPersist,
  suspendSessionPersist,
} from "@/lib/session-persist-sync";
import { ensureThreadIdle } from "@/lib/thread-run-control";
import {
  deleteMessageNodeFromRepository,
  getDetachedFromMessageId,
} from "@/lib/thread-node-deletion";

type AssistantRuntime = NonNullable<ReturnType<typeof useAssistantRuntime>>;
type MainThreadRuntime = AssistantRuntime["threads"]["main"];
type ThreadExport = ReturnType<MainThreadRuntime["export"]>;
type ThreadExternalState = MessageFormatRepository<UIMessage>;

type InternalThreadControl = MainThreadRuntime & {
  __internal_threadBinding?: {
    getState?: () => {
      getMessageById?: (messageId: string) => unknown;
      switchToBranch?: (branchId: string) => void;
    };
  };
};

const waitForCanvasCommit = async () => {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
};

const waitForAdapterSettle = async (delayMs = 100) => {
  await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
  await waitForCanvasCommit();
};

const orderExternalStateForRestore = (
  externalState: ThreadExternalState,
): ThreadExternalState => {
  const entryById = new Map(
    externalState.messages.map((entry) => [entry.message.id, entry] as const),
  );
  if (entryById.size !== externalState.messages.length) {
    throw new Error("The external conversation contains duplicate message ids.");
  }

  const ordered: ThreadExternalState["messages"] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error("The external conversation contains a parent cycle.");
    }
    const entry = entryById.get(id);
    if (!entry) {
      throw new Error(`The external conversation is missing parent ${id}.`);
    }
    visiting.add(id);
    if (entry.parentId) visit(entry.parentId);
    visiting.delete(id);
    visited.add(id);
    ordered.push(entry);
  };

  externalState.messages.forEach((entry) => visit(entry.message.id));
  if (externalState.headId && !entryById.has(externalState.headId)) {
    throw new Error("The external conversation head is unavailable.");
  }
  return { ...externalState, messages: ordered };
};

const restoreThreadRepository = async (
  thread: MainThreadRuntime,
  snapshot: ThreadExport,
  externalState: ThreadExternalState,
) => {
  const importableSnapshot = orderThreadSnapshotForImport(snapshot);
  if (importableSnapshot.messages.length !== snapshot.messages.length) {
    throw new Error("The Canvas repository has an invalid parent topology.");
  }
  const importableExternalState = orderExternalStateForRestore(externalState);
  const expectedHeadId = importableSnapshot.headId ?? null;
  const expectedIds = new Set(importableSnapshot.messages.map((entry) => entry.message.id));
  const expectedParentById = new Map(
    importableSnapshot.messages.map((entry) => [entry.message.id, entry.parentId] as const),
  );

  const unexpectedVisibleIds = thread
    .getState()
    .messages.map((message) => message.id)
    .filter((id) => !expectedIds.has(id) && !id.startsWith("__error__"))
    .reverse();
  for (const unexpectedId of unexpectedVisibleIds) {
    try {
      await thread.deleteMessage(unexpectedId);
      await waitForAdapterSettle();
    } catch {
      // The adapter may already have removed the message.
    }
  }

  const matchesExpectedSnapshot = () => {
    const restored = thread.export();
    const restoredEntries = restored.messages.filter(
      (entry) => !entry.message.id.startsWith("__error__"),
    );
    const restoredIds = new Set(restoredEntries.map((entry) => entry.message.id));
    return (
      (restored.headId ?? null) === expectedHeadId &&
      expectedIds.size === restoredIds.size &&
      [...expectedIds].every((id) => restoredIds.has(id)) &&
      restoredEntries.every(
        (entry) => expectedParentById.get(entry.message.id) === entry.parentId,
      )
    );
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const internalState = (thread as InternalThreadControl).__internal_threadBinding?.getState?.();
    if (
      expectedHeadId &&
      internalState?.getMessageById?.(expectedHeadId) &&
      typeof internalState.switchToBranch === "function"
    ) {
      internalState.switchToBranch(expectedHeadId);
    } else {
      thread.reset();
    }

    await waitForAdapterSettle();
    thread.importExternalState(importableExternalState);
    await waitForAdapterSettle();
    if (!matchesExpectedSnapshot()) continue;
    await waitForAdapterSettle(150);
    if (!matchesExpectedSnapshot()) continue;
    notifySessionRuntimeReplaced(
      importableSnapshot as unknown as SessionThreadExport,
    );
    return;
  }

  throw new Error("The conversation could not be updated after deleting this node.");
};

const cloneValue = <T,>(value: T): T =>
  typeof structuredClone === "function" ? structuredClone(value) : value;

export function useCanvasMessageDeletion(messageId: string | null) {
  const runtime = useAssistantRuntime();
  const { activeSession, saveActiveSessionDocumentPatch } = usePersistedSessions();
  const { canvasLinks, removeCanvasLink } = useSessionArtifacts();
  const { clearRequestError, setRequestError } = useRequestError();
  const {
    canvasSelectionId,
    focusedMessageId,
    setCanvasSelectionId,
    setFocusedMessageId,
  } = useSessionUiState();
  const [isDeleting, setIsDeleting] = React.useState(false);

  const isDetached = React.useMemo(() => {
    if (!messageId) return false;
    const entry = activeSession?.snapshot.messages.find(
      (candidate) => candidate.message.id === messageId,
    );
    return Boolean(entry && getDetachedFromMessageId(entry.message));
  }, [activeSession?.snapshot.messages, messageId]);

  const deleteMessageNode = React.useCallback(() => {
    if (!messageId || isDeleting) return;
    const confirmed = window.confirm(
      "Delete this message node? Its connections will be removed. Child messages will remain available under Detached messages.",
    );
    if (!confirmed) return;

    void (async () => {
      setIsDeleting(true);
      clearRequestError();
      let suspensionToken: ReturnType<typeof suspendSessionPersist> | null = null;
      try {
        const thread = runtime.threads.main;
        const threadReady = await ensureThreadIdle(thread);
        if (!threadReady) {
          throw new Error(
            "The current assistant run could not be stopped. Wait for it to finish, then delete the node.",
          );
        }

        await forceSessionPersist();
        suspensionToken = suspendSessionPersist();

        const exportedSnapshot = thread.export();
        const exportedExternalState =
          thread.exportExternalState() as ThreadExternalState;
        const visibleMessages = thread
          .getState()
          .messages.filter((message) => !message.id.startsWith("__error__"));
        const visibleExternalMessages = collectVisibleExternalMessageChain(
          visibleMessages,
          exportedExternalState,
        );
        const repairedSnapshot = repairThreadSnapshotFromVisibleBranch(
          cloneValue(exportedSnapshot),
          cloneValue(visibleMessages),
        );
        const repairedExternalState = repairExternalStateFromVisibleBranch(
          cloneValue(exportedExternalState),
          cloneValue(visibleExternalMessages),
        );

        const snapshotDeletion = deleteMessageNodeFromRepository(
          repairedSnapshot,
          messageId,
        );
        const externalDeletion = deleteMessageNodeFromRepository(
          repairedExternalState,
          messageId,
        );
        if (!snapshotDeletion.deleted || !externalDeletion.deleted) {
          throw new Error("This message is no longer available in the conversation repository.");
        }

        const linksToRemove = canvasLinks.filter(
          (link) =>
            link.promptId === messageId ||
            link.responseId === messageId ||
            link.targetMessageId === messageId,
        );
        const removedLinkIds = new Set(linksToRemove.map((link) => link.id));
        const nextCanvasLinks = canvasLinks.filter((link) => !removedLinkIds.has(link.id));
        linksToRemove.forEach((link) => removeCanvasLink(link.id));

        await restoreThreadRepository(
          thread,
          snapshotDeletion.repository,
          externalDeletion.repository,
        );
        await saveActiveSessionDocumentPatch({
          snapshot: snapshotDeletion.repository as unknown as SessionThreadExport,
          contextLinks: nextCanvasLinks,
        });

        if (focusedMessageId === messageId) setFocusedMessageId(null);
        if (canvasSelectionId === messageId) setCanvasSelectionId(null);
      } catch (error) {
        setRequestError(
          error instanceof Error
            ? error.message
            : "The message node could not be deleted.",
        );
      } finally {
        if (suspensionToken) resumeSessionPersist(suspensionToken);
        setIsDeleting(false);
      }
    })();
  }, [
    canvasLinks,
    canvasSelectionId,
    clearRequestError,
    focusedMessageId,
    isDeleting,
    messageId,
    removeCanvasLink,
    runtime.threads.main,
    saveActiveSessionDocumentPatch,
    setCanvasSelectionId,
    setFocusedMessageId,
    setRequestError,
  ]);

  return { deleteMessageNode, isDeleting, isDetached };
}
