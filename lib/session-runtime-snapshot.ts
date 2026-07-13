import type { SessionThreadExport } from "@/lib/session-documents";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type PersistableRuntimeMessage = Record<string, unknown> & { id: string };

const hasSubstantiveContent = (message: Record<string, unknown>) => {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    if (!isRecord(part)) return false;
    if (typeof part.text === "string") return part.text.trim().length > 0;
    return Object.keys(part).some((key) => key !== "type");
  });
};

const normalizePersistableRuntimeMessage = (
  message: Record<string, unknown>,
): PersistableRuntimeMessage | null => {
  if (typeof message.id !== "string" || message.id.length === 0) return null;
  const messageId = message.id;
  const metadata = isRecord(message.metadata) ? message.metadata : null;

  if (metadata?.isOptimistic !== true) {
    return {
      ...message,
      id: messageId,
    };
  }

  // AI SDK 7 responses remain marked optimistic in react-ai-sdk 1.3.x even
  // after visible content has arrived. Persist substantive assistant output,
  // but continue ignoring empty placeholders.
  if (message.role !== "assistant" || !hasSubstantiveContent(message)) {
    return null;
  }

  const nextMetadata = { ...metadata };
  delete nextMetadata.isOptimistic;
  return {
    ...message,
    id: messageId,
    metadata: nextMetadata,
  };
};

export const mergeSessionSnapshotRepositories = (
  ...snapshots: Array<SessionThreadExport | null | undefined>
): SessionThreadExport => {
  const messages: SessionThreadExport["messages"] = [];
  const indexById = new Map<string, number>();
  let headId: string | null = null;

  snapshots.forEach((snapshot) => {
    if (!snapshot) return;
    if (snapshot.headId) headId = snapshot.headId;
    snapshot.messages.forEach((entry) => {
      const id = typeof entry.message.id === "string" ? entry.message.id : null;
      if (!id) return;
      const nextEntry = { parentId: entry.parentId, message: entry.message };
      const existingIndex = indexById.get(id);
      if (existingIndex === undefined) {
        indexById.set(id, messages.length);
        messages.push(nextEntry);
      } else {
        messages[existingIndex] = nextEntry;
      }
    });
  });

  return { headId, messages };
};

export const mergeRuntimeBranchIntoSessionSnapshot = (
  repositorySnapshot: SessionThreadExport | null,
  runtimeBranch: readonly Record<string, unknown>[],
): SessionThreadExport => {
  const baseMessages = repositorySnapshot?.messages ?? [];
  const mergedMessages = baseMessages.map((entry) => ({
    parentId: entry.parentId,
    message: entry.message,
  }));
  const indexById = new Map<string, number>();

  mergedMessages.forEach((entry, index) => {
    if (typeof entry.message.id === "string") {
      indexById.set(entry.message.id, index);
    }
  });

  const branchMessages = runtimeBranch
    .map(normalizePersistableRuntimeMessage)
    .filter((message): message is PersistableRuntimeMessage => message !== null);
  branchMessages.forEach((message, index) => {
    const parentId = index === 0 ? null : branchMessages[index - 1]!.id;
    const nextEntry = { parentId, message };
    const existingIndex = indexById.get(message.id);

    if (existingIndex === undefined) {
      indexById.set(message.id, mergedMessages.length);
      mergedMessages.push(nextEntry);
      return;
    }
    mergedMessages[existingIndex] = nextEntry;
  });

  return {
    headId: branchMessages.at(-1)?.id ?? repositorySnapshot?.headId ?? null,
    messages: mergedMessages,
  };
};
