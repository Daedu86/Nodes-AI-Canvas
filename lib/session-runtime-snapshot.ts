import type { SessionThreadExport } from "@/lib/session-documents";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const DURABLE_CONTEXT_CUSTOM_KEYS = [
  "contextMessages",
  "contextScope",
  "historyMode",
  "model",
  "provider",
] as const;

const mergePersistedDurableContext = (
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) => {
  const previousMetadata = isRecord(previous.metadata) ? previous.metadata : {};
  const previousCustom = isRecord(previousMetadata.custom) ? previousMetadata.custom : {};
  const nextMetadata = isRecord(next.metadata) ? next.metadata : {};
  const nextCustom = isRecord(nextMetadata.custom) ? nextMetadata.custom : {};
  const preservedEntries = DURABLE_CONTEXT_CUSTOM_KEYS.flatMap((key) =>
    nextCustom[key] === undefined && previousCustom[key] !== undefined
      ? [[key, previousCustom[key]] as const]
      : [],
  );

  if (preservedEntries.length === 0) return next;

  return {
    ...next,
    metadata: {
      ...nextMetadata,
      custom: {
        ...Object.fromEntries(preservedEntries),
        ...nextCustom,
      },
    },
  };
};

type PersistableRuntimeMessage = Record<string, unknown> & { id: string };
const RUNTIME_OPTIMISTIC_CUSTOM_KEY = "__nodesRuntimeOptimistic";

const hasSubstantiveContent = (message: Record<string, unknown>) => {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    if (!isRecord(part)) return false;
    if (typeof part.text === "string") return part.text.trim().length > 0;
    return Object.keys(part).some((key) => key !== "type");
  });
};

const isTransientRuntimeAssistant = (message: Record<string, unknown>) => {
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const custom = metadata && isRecord(metadata.custom) ? metadata.custom : null;
  return custom?.[RUNTIME_OPTIMISTIC_CUSTOM_KEY] === true;
};

const normalizePersistableRuntimeMessage = (
  message: Record<string, unknown>,
): PersistableRuntimeMessage | null => {
  if (typeof message.id !== "string" || message.id.length === 0) return null;
  const messageId = message.id;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  if (metadata?.isOptimistic !== true) {
    return { ...message, id: messageId };
  }

  // The adapter can retain the optimistic flag even after content is complete.
  // Keep visible output, but tag only in-flight versions so an id swap replaces
  // the transient record instead of creating another assistant branch.
  if (message.role !== "assistant" || !hasSubstantiveContent(message)) return null;
  const status = isRecord(message.status) ? message.status : null;
  const nextMetadata = { ...metadata };
  delete nextMetadata.isOptimistic;
  const nextCustom = isRecord(metadata.custom) ? { ...metadata.custom } : {};
  if (status?.type === "complete") {
    delete nextCustom[RUNTIME_OPTIMISTIC_CUSTOM_KEY];
  } else {
    nextCustom[RUNTIME_OPTIMISTIC_CUSTOM_KEY] = true;
  }
  nextMetadata.custom = nextCustom;

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
        const previous = messages[existingIndex]!;
        messages[existingIndex] = {
          ...nextEntry,
          message: mergePersistedDurableContext(previous.message, nextEntry.message),
        };
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

  const rebuildIndex = () => {
    indexById.clear();
    mergedMessages.forEach((entry, index) => {
      if (typeof entry.message.id === "string") {
        indexById.set(entry.message.id, index);
      }
    });
  };

  rebuildIndex();

  const branchMessages = runtimeBranch
    .map(normalizePersistableRuntimeMessage)
    .filter((message): message is PersistableRuntimeMessage => message !== null);
  branchMessages.forEach((message, index) => {
    const parentId = index === 0 ? null : branchMessages[index - 1]!.id;
    const nextEntry = { parentId, message };

    if (message.role === "assistant") {
      let removedTransient = false;
      for (let entryIndex = mergedMessages.length - 1; entryIndex >= 0; entryIndex -= 1) {
        const entry = mergedMessages[entryIndex]!;
        if (
          entry.parentId === parentId &&
          entry.message.role === "assistant" &&
          entry.message.id !== message.id &&
          isTransientRuntimeAssistant(entry.message)
        ) {
          mergedMessages.splice(entryIndex, 1);
          removedTransient = true;
        }
      }
      if (removedTransient) rebuildIndex();
    }

    const existingIndex = indexById.get(message.id);

    if (existingIndex === undefined) {
      indexById.set(message.id, mergedMessages.length);
      mergedMessages.push(nextEntry);
      return;
    }
    const previous = mergedMessages[existingIndex]!;
    mergedMessages[existingIndex] = {
      ...nextEntry,
      message: mergePersistedDurableContext(previous.message, nextEntry.message),
    };
  });

  return {
    headId: branchMessages.at(-1)?.id ?? repositorySnapshot?.headId ?? null,
    messages: mergedMessages,
  };
};
