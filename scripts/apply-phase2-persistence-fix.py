from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:180]!r}")
    write(path, text.replace(old, new))


Path("lib/session-runtime-snapshot.ts").write_text(
    '''import type { SessionThreadExport } from "@/lib/session-documents";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPersistableRuntimeMessage = (
  message: Record<string, unknown>,
): message is Record<string, unknown> & { id: string } => {
  if (typeof message.id !== "string" || message.id.length === 0) return false;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return metadata?.isOptimistic !== true;
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

  const branchMessages = runtimeBranch.filter(isPersistableRuntimeMessage);
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
''',
    encoding="utf-8",
)

# Add an explicit completion signal to the existing persistence synchronizer.
sync_path = "lib/session-persist-sync.ts"
replace_once(
    sync_path,
    '''export const FORCE_PERSIST_SESSION_EVENT = "assistant-ui:force-persist-session";
''',
    '''export const FORCE_PERSIST_SESSION_EVENT = "assistant-ui:force-persist-session";
export const SESSION_RUN_FINISHED_EVENT = "assistant-ui:session-run-finished";

export const notifySessionRunFinished = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_RUN_FINISHED_EVENT));
};
''',
)

# Signal completion from the callback that is guaranteed by the AI SDK adapter.
assistant_path = "app/assistant.tsx"
replace_once(
    assistant_path,
    '''import { rememberMessageLatencyEntry } from "@/lib/message-latency-registry";
''',
    '''import { rememberMessageLatencyEntry } from "@/lib/message-latency-registry";
import { notifySessionRunFinished } from "@/lib/session-persist-sync";
''',
)
replace_once(
    assistant_path,
    '''      onError: (error: Error) => {
        pendingLatencyRef.current = null;
        setRequestError(getRequestErrorMessageFromThrowable(error));
      },
''',
    '''      onError: (error: Error) => {
        pendingLatencyRef.current = null;
        setRequestError(getRequestErrorMessageFromThrowable(error));
        notifySessionRunFinished();
      },
''',
)
replace_once(
    assistant_path,
    '''      onFinish: ({ message }: { message?: { id?: string } }) => {
        recordPendingLatency(message?.id);
      },
''',
    '''      onFinish: ({ message }: { message?: { id?: string } }) => {
        recordPendingLatency(message?.id);
        notifySessionRunFinished();
      },
''',
)

bridge = "components/context/persisted-session-runtime-bridge.tsx"
replace_once(
    bridge,
    '''  FORCE_PERSIST_SESSION_EVENT,
  markSessionPersistPending,
''',
    '''  FORCE_PERSIST_SESSION_EVENT,
  SESSION_RUN_FINISHED_EVENT,
  markSessionPersistPending,
''',
)
replace_once(
    bridge,
    'import type { SessionThreadExport } from "@/lib/session-documents";\n',
    'import type { SessionThreadExport } from "@/lib/session-documents";\nimport { mergeRuntimeBranchIntoSessionSnapshot } from "@/lib/session-runtime-snapshot";\n',
)
replace_once(
    bridge,
    '''const THREAD_EVENTS = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
] as const;
''',
    '''const THREAD_EVENTS = [
  "initialize",
  "runStart",
  "runEnd",
  "modelContextUpdate",
] as const;

// The adapter's onFinish can precede its final external-store update by a tick.
const RUN_END_PERSIST_RETRY_DELAYS_MS = [0, 50, 150, 300, 600] as const;
''',
)
replace_once(
    bridge,
    '''const exportExternalStateAsSnapshot = (
  thread: AssistantRuntime["threads"]["main"],
): SessionThreadExport | null => {
  try {
    const exported = (thread as unknown as { exportExternalState?: () => MessageFormatRepository<UIMessage> })
      .exportExternalState?.();
    if (!exported || !Array.isArray(exported.messages)) {
      return null;
    }
    return {
      headId: exported.headId ?? null,
      messages: exported.messages.map((item) => ({
        parentId: item.parentId ?? null,
        message: item.message as unknown as Record<string, unknown>,
      })),
    };
  } catch {
    return null;
  }
};

''',
    '',
)
replace_once(
    bridge,
    '''const toPersistedSnapshot = (snapshot: ThreadExport): SessionThreadExport => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: isRecord(entry.message)
      ? normalizeAssistantStatusForPersistence(entry.message)
      : entry.message,
  })),
});
''',
    '''const toPersistedSnapshot = (snapshot: ThreadExport): SessionThreadExport => ({
  headId: snapshot.headId ?? null,
  messages: snapshot.messages.map((entry) => ({
    parentId: entry.parentId,
    message: isRecord(entry.message)
      ? normalizeAssistantStatusForPersistence(entry.message)
      : entry.message,
  })),
});

const exportRuntimeSnapshot = (
  thread: AssistantRuntime["threads"]["main"],
): SessionThreadExport => {
  let repositorySnapshot: SessionThreadExport | null = null;
  try {
    repositorySnapshot = toPersistedSnapshot(thread.export());
  } catch {
    // The runtime can temporarily be a remote-thread placeholder during mount.
  }

  let runtimeBranch: Record<string, unknown>[] = [];
  try {
    runtimeBranch = thread
      .getState()
      .messages.filter((message) => isRecord(message))
      .map((message) => normalizeAssistantStatusForPersistence(message));
  } catch {
    // Keep the repository export as the fallback when state is not ready yet.
  }

  return mergeRuntimeBranchIntoSessionSnapshot(repositorySnapshot, runtimeBranch);
};
''',
)
replace_all(
    bridge,
    '''exportExternalStateAsSnapshot(runtime.threads.main) ??
          toPersistedSnapshot(runtime.threads.main.export())''',
    '''exportRuntimeSnapshot(runtime.threads.main)''',
    expected=2,
)
replace_all(
    bridge,
    '''exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export())''',
    '''exportRuntimeSnapshot(thread)''',
    expected=2,
)
replace_once(
    bridge,
    '''  const runActiveRef = React.useRef(false);
  const pendingForcePersistResolversRef = React.useRef<Array<() => void>>([]);
''',
    '''  const runActiveRef = React.useRef(false);
  const runEndPersistGenerationRef = React.useRef(0);
  const pendingForcePersistResolversRef = React.useRef<Array<() => void>>([]);
''',
)
replace_once(
    bridge,
    '''    const scheduleFlush = () => {
''',
    '''    const persistSettledRun = async () => {
      const generation = ++runEndPersistGenerationRef.current;

      for (const delayMs of RUN_END_PERSIST_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
        if (runEndPersistGenerationRef.current !== generation) return;
        try {
          await flush({ allowEmptyOverride: true });
        } catch {
          // A later retry can still succeed after a transient repository/API error.
        }
      }

      if (
        runEndPersistGenerationRef.current === generation &&
        pendingForcePersistResolversRef.current.length > 0
      ) {
        resolvePendingForcePersists();
      }
    };

    const handleRunFinished = () => {
      runActiveRef.current = false;
      markSessionPersistPending();
      void persistSettledRun();
    };

    const scheduleFlush = () => {
''',
)
replace_once(
    bridge,
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        markSessionPersistPending();
''',
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        runEndPersistGenerationRef.current += 1;
        markSessionPersistPending();
''',
)
replace_once(
    bridge,
    '''      thread.unstable_on("runEnd", () => {
        runActiveRef.current = false;
        // Flush immediately at run end so reopening the app right after a reply
        // still restores the latest conversation state.
        void flush({ allowEmptyOverride: true }).finally(() => {
          if (pendingForcePersistResolversRef.current.length === 0) {
            return;
          }
          resolvePendingForcePersists();
        });
      }),
''',
    '''      thread.unstable_on("runEnd", handleRunFinished),
''',
)
replace_once(
    bridge,
    '''    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
''',
    '''    window.addEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
    window.addEventListener(SESSION_RUN_FINISHED_EVENT, handleRunFinished);
''',
)
replace_once(
    bridge,
    '''    return () => {
      runActiveRef.current = false;
      resolvePendingForcePersists();
''',
    '''    return () => {
      runActiveRef.current = false;
      runEndPersistGenerationRef.current += 1;
      resolvePendingForcePersists();
''',
)
replace_once(
    bridge,
    '''      window.removeEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
''',
    '''      window.removeEventListener(FORCE_PERSIST_SESSION_EVENT, handleForcePersist);
      window.removeEventListener(SESSION_RUN_FINISHED_EVENT, handleRunFinished);
''',
)

Path("tests/session-runtime-snapshot.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";
import type { SessionThreadExport } from "../lib/session-documents";
import { mergeRuntimeBranchIntoSessionSnapshot } from "../lib/session-runtime-snapshot";

const message = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  content: [{ type: "text", text }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  metadata: { custom: {} },
  ...(role === "assistant"
    ? { status: { type: "complete", reason: "stop" } }
    : { attachments: [] }),
});

describe("mergeRuntimeBranchIntoSessionSnapshot", () => {
  it("adds the assistant message visible in the active runtime branch", () => {
    const user = message("user-1", "user", "Hello");
    const assistant = message("assistant-1", "assistant", "Hi");
    const repository: SessionThreadExport = {
      headId: "user-1",
      messages: [{ parentId: null, message: user }],
    };
    expect(mergeRuntimeBranchIntoSessionSnapshot(repository, [user, assistant])).toEqual({
      headId: "assistant-1",
      messages: [
        { parentId: null, message: user },
        { parentId: "user-1", message: assistant },
      ],
    });
  });

  it("preserves messages from inactive branches", () => {
    const root = message("root", "user", "Question");
    const oldAssistant = message("old", "assistant", "Old answer");
    const newAssistant = message("new", "assistant", "New answer");
    const repository: SessionThreadExport = {
      headId: "old",
      messages: [
        { parentId: null, message: root },
        { parentId: "root", message: oldAssistant },
      ],
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(repository, [root, newAssistant]);
    expect(merged.headId).toBe("new");
    expect(merged.messages).toContainEqual({ parentId: "root", message: oldAssistant });
    expect(merged.messages).toContainEqual({ parentId: "root", message: newAssistant });
  });

  it("does not persist optimistic placeholders", () => {
    const root = message("root", "user", "Question");
    const optimistic = {
      ...message("optimistic", "assistant", "Loading"),
      metadata: { custom: {}, isOptimistic: true },
    };
    const merged = mergeRuntimeBranchIntoSessionSnapshot(null, [root, optimistic]);
    expect(merged.headId).toBe("root");
    expect(merged.messages).toHaveLength(1);
  });
});
''',
    encoding="utf-8",
)
