from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/session-runtime-snapshot.ts",
    '''const isPersistableRuntimeMessage = (
  message: Record<string, unknown>,
): message is Record<string, unknown> & { id: string } => {
  if (typeof message.id !== "string" || message.id.length === 0) return false;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return metadata?.isOptimistic !== true;
};''',
    '''type PersistableRuntimeMessage = Record<string, unknown> & { id: string };

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
};''',
)

replace_once(
    "lib/session-runtime-snapshot.ts",
    '''  const branchMessages = runtimeBranch.filter(isPersistableRuntimeMessage);''',
    '''  const branchMessages = runtimeBranch
    .map(normalizePersistableRuntimeMessage)
    .filter((message): message is PersistableRuntimeMessage => message !== null);''',
)

replace_once(
    "tests/session-runtime-snapshot.test.ts",
    '''  it("does not persist optimistic placeholders", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", "Loading"),
      metadata: { custom: {}, isOptimistic: true },
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(merged.headId).toBe("root");
    expect(merged.messages).toHaveLength(1);
  });''',
    '''  it("persists substantive optimistic assistant output without the marker", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", "Rendered answer"),
      metadata: { custom: {}, isOptimistic: true },
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(merged.headId).toBe("optimistic");
    expect(merged.messages).toHaveLength(2);
    expect(merged.messages[1]?.message.metadata).toEqual({ custom: {} });
  });

  it("does not persist empty optimistic placeholders", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", ""),
      content: [],
      metadata: { custom: {}, isOptimistic: true },
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(merged.headId).toBe("root");
    expect(merged.messages).toHaveLength(1);
  });''',
)
