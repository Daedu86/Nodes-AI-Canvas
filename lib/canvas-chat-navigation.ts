export type CanvasBranchRepositoryLike = {
  headId?: string | null;
  messages: ReadonlyArray<{
    message: { id: string };
  }>;
};

export function focusCanvasMessageBranch<T extends CanvasBranchRepositoryLike>(
  repository: T,
  messageId: string,
): T | null {
  if (!repository.messages.some((entry) => entry.message.id === messageId)) {
    return null;
  }
  if (repository.headId === messageId) return repository;
  return {
    ...repository,
    headId: messageId,
  };
}
