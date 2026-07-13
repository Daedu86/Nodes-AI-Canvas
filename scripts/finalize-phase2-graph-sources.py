from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:220]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/session-runtime-snapshot.ts",
    '''export const mergeRuntimeBranchIntoSessionSnapshot = (
''',
    '''export const mergeSessionSnapshotRepositories = (
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
''',
)

replace_once(
    "tests/session-runtime-snapshot.test.ts",
    '''import { mergeRuntimeBranchIntoSessionSnapshot } from "../lib/session-runtime-snapshot";''',
    '''import {
  mergeRuntimeBranchIntoSessionSnapshot,
  mergeSessionSnapshotRepositories,
} from "../lib/session-runtime-snapshot";''',
)

replace_once(
    "tests/session-runtime-snapshot.test.ts",
    '''describe("mergeRuntimeBranchIntoSessionSnapshot", () => {''',
    '''describe("mergeSessionSnapshotRepositories", () => {
  it("preserves inactive branches while newer repositories replace matching ids", () => {
    const root = message("root", "user", "Question");
    const oldAssistant = message("old", "assistant", "Old answer");
    const updatedRoot = message("root", "user", "Updated question");
    const newAssistant = message("new", "assistant", "New answer");

    const merged = mergeSessionSnapshotRepositories(
      {
        headId: "old",
        messages: [
          { parentId: null, message: root },
          { parentId: "root", message: oldAssistant },
        ],
      },
      {
        headId: "new",
        messages: [
          { parentId: null, message: updatedRoot },
          { parentId: "root", message: newAssistant },
        ],
      },
    );

    expect(merged.headId).toBe("new");
    expect(merged.messages).toHaveLength(3);
    expect(merged.messages[0]?.message).toEqual(updatedRoot);
    expect(merged.messages).toContainEqual({ parentId: "root", message: oldAssistant });
    expect(merged.messages).toContainEqual({ parentId: "root", message: newAssistant });
  });
});

describe("mergeRuntimeBranchIntoSessionSnapshot", () => {''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''import { getModelEntry, rememberModelEntry, type ModelEntry } from "@/lib/message-model-registry";
''',
    '''import { getModelEntry, rememberModelEntry, type ModelEntry } from "@/lib/message-model-registry";
import type { SessionThreadExport } from "@/lib/session-documents";
import {
  mergeRuntimeBranchIntoSessionSnapshot,
  mergeSessionSnapshotRepositories,
} from "@/lib/session-runtime-snapshot";
import { SESSION_RUNTIME_CHANGED_EVENT } from "@/lib/session-persist-sync";
''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''type Options = {
  enabled?: boolean;
  defaultModel?: { modelId: string; provider: string };
};''',
    '''type Options = {
  enabled?: boolean;
  defaultModel?: { modelId: string; provider: string };
  persistedSnapshot?: SessionThreadExport | null;
  sessionKey?: string | null;
};''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''  const { enabled = true, defaultModel } = options;
  const defaultModelId = defaultModel?.modelId;
  const defaultProvider = defaultModel?.provider;
  const [items, setItems] = useState<ThreadRepoItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());''',
    '''  const { enabled = true, defaultModel, persistedSnapshot = null, sessionKey = null } = options;
  const defaultModelId = defaultModel?.modelId;
  const defaultProvider = defaultModel?.provider;
  const [items, setItems] = useState<ThreadRepoItem[]>([]);
  const itemsRef = useRef<ThreadRepoItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const sessionKeyRef = useRef<string | null>(sessionKey);''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''    if (!enabled) {
      setItems([]);
      return;
    }
''',
    '''    if (!enabled) {
      itemsRef.current = [];
      setItems([]);
      return;
    }

    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      itemsRef.current = [];
      seenIdsRef.current = new Set();
    }
''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''        const exportValue = thread.export();
        const rawItems = Array.isArray(exportValue?.messages) ? exportValue.messages : [];

        // Record model/provider once per message (without mutating message data).
        rawItems.forEach((item) => {''',
    '''        const exportValue = thread.export();
        const rawItems = Array.isArray(exportValue?.messages) ? exportValue.messages : [];
        const previousSnapshot: SessionThreadExport = {
          headId: null,
          messages: itemsRef.current.map((item) => ({
            parentId: item.parentId,
            message: item.message as unknown as Record<string, unknown>,
          })),
        };
        const runtimeSnapshot: SessionThreadExport = {
          headId: exportValue?.headId ?? null,
          messages: rawItems.map((item) => ({
            parentId: item.parentId,
            message: item.message as unknown as Record<string, unknown>,
          })),
        };
        const repositorySnapshot = mergeSessionSnapshotRepositories(
          persistedSnapshot,
          previousSnapshot,
          runtimeSnapshot,
        );
        const visibleBranch = thread
          .getState()
          .messages.filter(
            (message): message is Record<string, unknown> =>
              typeof message === "object" && message !== null,
          );
        const mergedSnapshot = mergeRuntimeBranchIntoSessionSnapshot(
          repositorySnapshot,
          visibleBranch,
        );
        const nextItems = mergedSnapshot.messages as unknown as ThreadRepoItem[];

        // Record model/provider once per message (without mutating message data).
        nextItems.forEach((item) => {''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''        setItems(rawItems);
''',
    '''        itemsRef.current = nextItems;
        setItems(nextItems);
''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, readExport));
    });

    return () => {''',
    '''    THREAD_EVENTS.forEach((event) => {
      unsubscribes.push(thread.unstable_on(event, readExport));
    });
    window.addEventListener(SESSION_RUNTIME_CHANGED_EVENT, readExport);

    return () => {
      window.removeEventListener(SESSION_RUNTIME_CHANGED_EVENT, readExport);''',
)

replace_once(
    "components/assistant-ui/use-thread-repo-items.ts",
    '''  }, [enabled, runtime, defaultModelId, defaultProvider]);''',
    '''  }, [
    defaultModelId,
    defaultProvider,
    enabled,
    persistedSnapshot,
    runtime,
    sessionKey,
  ]);''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx",
    '''  const { activeSessionId } = usePersistedSessions();''',
    '''  const { activeSession, activeSessionId } = usePersistedSessions();''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/thread-graph-flow.tsx",
    '''  } = useThreadRepoItems(runtime, { defaultModel: { modelId, provider } });''',
    '''  } = useThreadRepoItems(runtime, {
    defaultModel: { modelId, provider },
    persistedSnapshot: activeSession?.snapshot ?? null,
    sessionKey: activeSessionId,
  });''',
)
