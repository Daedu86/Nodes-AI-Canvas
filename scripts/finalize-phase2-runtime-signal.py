from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/session-persist-sync.ts",
    '''export const SESSION_RUNTIME_SETTLED_EVENT = "assistant-ui:session-runtime-settled";

export const notifySessionRuntimeSettled = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_RUNTIME_SETTLED_EVENT));
};''',
    '''export const SESSION_RUNTIME_CHANGED_EVENT = "assistant-ui:session-runtime-changed";

export const notifySessionRuntimeChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_RUNTIME_CHANGED_EVENT));
};''',
)

replace_once(
    "app/assistant.tsx",
    'import { notifySessionRuntimeSettled } from "@/lib/session-persist-sync";',
    'import { notifySessionRuntimeChanged } from "@/lib/session-persist-sync";',
)

replace_once(
    "app/assistant.tsx",
    '''function SessionRuntimePersistenceSignal() {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const messages = useAuiState((state) => state.thread.messages);
  const lastMessage = messages.at(-1);
  const lastMessageId = lastMessage?.id ?? null;
  const lastMessageRole = lastMessage?.role ?? null;
  const lastMessageStatus = lastMessage?.status?.type ?? null;
  const contentSignature = React.useMemo(
    () =>
      JSON.stringify(
        messages.map((message) => ({
          content: message.content,
          id: message.id,
          role: message.role,
          status: message.status,
        })),
      ),
    [messages],
  );

  React.useEffect(() => {
    if (isRunning || messages.length === 0) return;
    if (lastMessageRole === "assistant" && lastMessageStatus === "running") return;
    notifySessionRuntimeSettled();
  }, [
    contentSignature,
    isRunning,
    lastMessageId,
    lastMessageRole,
    lastMessageStatus,
    messages.length,
  ]);

  return null;
}''',
    '''function SessionRuntimePersistenceSignal() {
  const messages = useAuiState((state) => state.thread.messages);
  const contentSignature = React.useMemo(
    () =>
      JSON.stringify(
        messages.map((message) => ({
          content: message.content,
          id: message.id,
          role: message.role,
          status: message.status,
        })),
      ),
    [messages],
  );

  React.useEffect(() => {
    if (messages.length === 0) return;
    notifySessionRuntimeChanged();
  }, [contentSignature, messages.length]);

  return null;
}''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '  SESSION_RUNTIME_SETTLED_EVENT,',
    '  SESSION_RUNTIME_CHANGED_EVENT,',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''// React store updates can precede the adapter's repository update by a tick.
const SETTLED_PERSIST_RETRY_DELAYS_MS = [0, 50, 150, 300] as const;
''',
    '',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''  const runActiveRef = React.useRef(false);
  const settledPersistGenerationRef = React.useRef(0);
  const pendingForcePersistResolversRef = React.useRef<Array<() => void>>([]);''',
    '''  const runActiveRef = React.useRef(false);
  const pendingForcePersistResolversRef = React.useRef<Array<() => void>>([]);''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    const persistSettledRuntime = async () => {
      const generation = ++settledPersistGenerationRef.current;

      for (const delayMs of SETTLED_PERSIST_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
        if (settledPersistGenerationRef.current !== generation) return;
        try {
          await flush({ allowEmptyOverride: true });
        } catch {
          // A later retry can still succeed after a transient repository/API error.
        }
      }

      if (
        settledPersistGenerationRef.current === generation &&
        pendingForcePersistResolversRef.current.length > 0
      ) {
        resolvePendingForcePersists();
      }
    };

    const handleRuntimeSettled = () => {
      runActiveRef.current = false;
      markSessionPersistPending();
      void persistSettledRuntime();
    };

    const scheduleFlush = () => {''',
    '''    const scheduleFlush = () => {''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        settledPersistGenerationRef.current += 1;
        markSessionPersistPending();''',
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        markSessionPersistPending();''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''      thread.unstable_on("runEnd", handleRuntimeSettled),''',
    '''      thread.unstable_on("runEnd", () => {
        runActiveRef.current = false;
        scheduleFlush();
        resolvePendingForcePersists();
      }),''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
    window.addEventListener(SESSION_RUNTIME_SETTLED_EVENT, handleRuntimeSettled);''',
    '''    const handleRuntimeChanged = () => {
      // The rendered Assistant UI branch is the source of truth even when the
      // adapter leaves run lifecycle flags stale after the stream has rendered.
      runActiveRef.current = false;
      scheduleFlush();
      resolvePendingForcePersists();
    };
    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
    window.addEventListener(SESSION_RUNTIME_CHANGED_EVENT, handleRuntimeChanged);''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    return () => {
      runActiveRef.current = false;
      settledPersistGenerationRef.current += 1;
      resolvePendingForcePersists();''',
    '''    return () => {
      runActiveRef.current = false;
      resolvePendingForcePersists();''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''      window.removeEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
      window.removeEventListener(SESSION_RUNTIME_SETTLED_EVENT, handleRuntimeSettled);''',
    '''      window.removeEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
      window.removeEventListener(SESSION_RUNTIME_CHANGED_EVENT, handleRuntimeChanged);''',
)
