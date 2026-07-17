export const DETACHED_FROM_MESSAGE_KEY = "__nodesDetachedFrom";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getDetachedFromMessageId = (message: unknown): string | null => {
  if (!isRecord(message)) return null;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  const custom = metadata && isRecord(metadata.custom) ? metadata.custom : null;
  const detachedFrom = custom?.[DETACHED_FROM_MESSAGE_KEY];
  return typeof detachedFrom === "string" && detachedFrom.length > 0
    ? detachedFrom
    : null;
};

const markMessageDetached = <TMessage extends { id: string }>(
  message: TMessage,
  deletedParentId: string,
): TMessage => {
  const messageRecord = message as TMessage & Record<string, unknown>;
  const metadata = isRecord(messageRecord.metadata) ? messageRecord.metadata : {};
  const custom = isRecord(metadata.custom) ? metadata.custom : {};
  return {
    ...messageRecord,
    metadata: {
      ...metadata,
      custom: {
        ...custom,
        [DETACHED_FROM_MESSAGE_KEY]: deletedParentId,
      },
    },
  } as TMessage;
};

type RepositoryEntry<TMessage> = {
  parentId: string | null;
  message: TMessage;
};

type ThreadRepository<TMessage> = {
  headId?: string | null;
  messages: RepositoryEntry<TMessage>[];
};

export type DeleteMessageNodeResult<TRepository> = {
  repository: TRepository;
  deleted: boolean;
  deletedParentId: string | null;
  detachedRootIds: string[];
  headChanged: boolean;
};

export function deleteMessageNodeFromRepository<
  TMessage extends { id: string },
  TRepository extends ThreadRepository<TMessage>,
>(repository: TRepository, messageId: string): DeleteMessageNodeResult<TRepository> {
  const target = repository.messages.find((entry) => entry.message.id === messageId);
  if (!target) {
    return {
      repository,
      deleted: false,
      deletedParentId: null,
      detachedRootIds: [],
      headChanged: false,
    };
  }

  const parentById = new Map(
    repository.messages.map((entry) => [entry.message.id, entry.parentId] as const),
  );
  let cursor = repository.headId ?? null;
  let deletedNodeIsInHeadLineage = false;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (cursor === messageId) {
      deletedNodeIsInHeadLineage = true;
      break;
    }
    cursor = parentById.get(cursor) ?? null;
  }

  const detachedRootIds: string[] = [];
  const messages = repository.messages.flatMap((entry) => {
    if (entry.message.id === messageId) return [];
    if (entry.parentId !== messageId) return [entry];
    detachedRootIds.push(entry.message.id);
    return [
      {
        ...entry,
        parentId: null,
        message: markMessageDetached(entry.message, messageId),
      },
    ];
  });
  const nextHeadId = deletedNodeIsInHeadLineage
    ? target.parentId
    : repository.headId ?? null;

  return {
    repository: {
      ...repository,
      headId: nextHeadId,
      messages,
    } as TRepository,
    deleted: true,
    deletedParentId: target.parentId,
    detachedRootIds,
    headChanged: deletedNodeIsInHeadLineage,
  };
}
