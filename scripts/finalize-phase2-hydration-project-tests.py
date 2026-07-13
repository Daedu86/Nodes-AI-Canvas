from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:240]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all(path: str, old: str, new: str, expected: int) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:240]!r}")
    file_path.write_text(text.replace(old, new), encoding="utf-8")


bridge = "components/context/persisted-session-runtime-bridge.tsx"
replace_once(
    bridge,
    '''const isUiMessageLike = (value: unknown): value is UIMessage =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.role === "user" || value.role === "assistant" || value.role === "system") &&
  Array.isArray((value as { parts?: unknown }).parts);

const isExternalStateSnapshot = (snapshot: SessionThreadExport) =>
  snapshot.messages.some((entry) => isUiMessageLike(entry.message));

const toExternalStateRepository = (
  snapshot: SessionThreadExport,
): MessageFormatRepository<UIMessage> => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages
    .filter((entry) => isUiMessageLike(entry.message))
    .map((entry) => ({
      parentId: entry.parentId,
      message: entry.message as unknown as UIMessage,
    })),
});
''',
    '''const isUiMessageLike = (value: unknown): value is UIMessage =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.role === "user" || value.role === "assistant" || value.role === "system") &&
  Array.isArray((value as { parts?: unknown }).parts);

const toUiMessagePart = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "text" || value.type === "reasoning") {
    return typeof value.text === "string"
      ? { type: value.type, text: value.text }
      : null;
  }
  if (value.type === "image") {
    const url =
      typeof value.image === "string"
        ? value.image
        : typeof value.url === "string"
          ? value.url
          : null;
    if (!url) return null;
    return {
      type: "file",
      url,
      mediaType:
        typeof value.mediaType === "string"
          ? value.mediaType
          : typeof value.mimeType === "string"
            ? value.mimeType
            : "image/*",
      ...(typeof value.filename === "string" ? { filename: value.filename } : {}),
    };
  }
  if (value.type === "file") {
    const url =
      typeof value.url === "string"
        ? value.url
        : typeof value.data === "string"
          ? value.data
          : typeof value.content === "string"
            ? value.content
            : null;
    const mediaType =
      typeof value.mediaType === "string"
        ? value.mediaType
        : typeof value.mimeType === "string"
          ? value.mimeType
          : null;
    if (!url || !mediaType) return null;
    return {
      type: "file",
      url,
      mediaType,
      ...(typeof value.filename === "string"
        ? { filename: value.filename }
        : typeof value.name === "string"
          ? { filename: value.name }
          : {}),
    };
  }
  return null;
};

const toUiMessage = (value: unknown): UIMessage | null => {
  if (isUiMessageLike(value)) return value;
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (value.role !== "user" && value.role !== "assistant" && value.role !== "system") {
    return null;
  }
  const sourceParts = Array.isArray(value.parts)
    ? value.parts
    : Array.isArray(value.content)
      ? value.content
      : typeof value.content === "string"
        ? [{ type: "text", text: value.content }]
        : [];
  const parts = sourceParts
    .map(toUiMessagePart)
    .filter((part): part is Record<string, unknown> => part !== null);
  if (parts.length === 0) return null;
  return {
    id: value.id,
    role: value.role,
    parts,
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
  } as unknown as UIMessage;
};

const toExternalStateRepository = (
  snapshot: SessionThreadExport,
): MessageFormatRepository<UIMessage> => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.flatMap((entry) => {
    const message = toUiMessage(entry.message);
    return message ? [{ parentId: entry.parentId, message }] : [];
  }),
});

const canImportAsExternalState = (snapshot: SessionThreadExport) =>
  snapshot.messages.length > 0 &&
  toExternalStateRepository(snapshot).messages.length === snapshot.messages.length;
''',
)

replace_once(
    bridge,
    '''const toComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: entry.message,
  })),
});
''',
    '''const toComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: entry.message,
  })),
});

const getHydrationText = (message: Record<string, unknown>) => {
  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : [];
  return parts
    .flatMap((part) =>
      isRecord(part) && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\\n");
};

const toHydrationComparableSnapshot = (snapshot: SessionThreadExport) => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    id: typeof entry.message.id === "string" ? entry.message.id : null,
    role: typeof entry.message.role === "string" ? entry.message.role : null,
    text: isRecord(entry.message) ? getHydrationText(entry.message) : "",
  })),
});
''',
)

replace_once(
    bridge,
    '''    const sanitizedSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
''',
    '''    const sanitizedSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
    const nextHydrationSignature = JSON.stringify(
      toHydrationComparableSnapshot(sanitizedSnapshot),
    );
''',
)

replace_once(
    bridge,
    '''        const runtimeSignature = JSON.stringify(toComparableSnapshot(currentPersisted));
        const switchingSessions = importedSessionIdRef.current !== activeSessionId;
''',
    '''        const runtimeSignature = JSON.stringify(
          toHydrationComparableSnapshot(currentPersisted),
        );
        const switchingSessions = importedSessionIdRef.current !== activeSessionId;
''',
)

replace_once(
    bridge,
    '''        if (runtimeSignature === nextSignature) {
''',
    '''        if (runtimeSignature === nextHydrationSignature) {
''',
)

replace_once(
    bridge,
    '''        if (isExternalStateSnapshot(sanitizedSnapshot)) {
          runtime.threads.main.importExternalState(toExternalStateRepository(sanitizedSnapshot));
        } else {
          runtime.threads.main.import(toRuntimeSnapshot(sanitizedSnapshot));
        }
''',
    '''        if (canImportAsExternalState(sanitizedSnapshot)) {
          runtime.threads.main.importExternalState(
            toExternalStateRepository(sanitizedSnapshot),
          );
        } else {
          runtime.threads.main.import(toRuntimeSnapshot(sanitizedSnapshot));
        }
''',
)

replace_once(
    bridge,
    '''        const importedSignature = JSON.stringify(toComparableSnapshot(importedPersisted));
        if (importedSignature === nextSignature) {
''',
    '''        const importedSignature = JSON.stringify(
          toHydrationComparableSnapshot(importedPersisted),
        );
        if (importedSignature === nextHydrationSignature) {
''',
)

project_workspace = "components/workspace/project-workspace.tsx"
replace_once(
    project_workspace,
    '''  const attachedMemoryItems = React.useMemo(() => {
    if (!activeProject) return [];
    if (Array.isArray(activeProject.attachedMemoryItems)) {
      return activeProject.attachedMemoryItems;
    }
    const attached = new Set(activeProject.memoryIds);
    return memoryItems.filter((item) => attached.has(item.id));
  }, [activeProject, memoryItems]);
''',
    '''  const attachedMemoryItems = React.useMemo(() => {
    if (!activeProject) return [];
    const attached = new Set(activeProject.memoryIds);
    const byId = new Map(
      (activeProject.attachedMemoryItems ?? [])
        .filter((item) => attached.has(item.id))
        .map((item) => [item.id, item] as const),
    );
    memoryItems.forEach((item) => {
      if (attached.has(item.id)) byId.set(item.id, item);
    });
    return [...byId.values()];
  }, [activeProject, memoryItems]);
''',
)

smoke = "tests/e2e/smoke.spec.ts"
replace_once(
    smoke,
    '  await page.getByRole("button", { name: "Draft" }).click();\n',
    '  await page.getByRole("button", { name: "Add Text block" }).click();\n',
)
replace_all(smoke, '"Draft 1"', '"Text Context 1"', expected=3)
replace_once(
    smoke,
    '  await page.getByRole("button", { name: "Show nody panel" }).click();\n',
    '',
)
