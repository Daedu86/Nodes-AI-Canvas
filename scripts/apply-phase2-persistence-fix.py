from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))


bridge = "components/context/persisted-session-runtime-bridge.tsx"

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

// The AI SDK adapter can emit runEnd before its external message repository has
// published the final assistant message. Retry briefly so persistence observes
// the settled repository rather than saving only the user message from runStart.
const RUN_END_PERSIST_RETRY_DELAYS_MS = [0, 50, 150, 300, 600] as const;
''',
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
    '''    const flush = async ({ allowEmptyOverride = false }: { allowEmptyOverride?: boolean } = {}) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const persistedSnapshot =
        exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export());
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));

      // Local fallback cache: helps restore conversation state if the user closes/navigates
      // before the server PATCH completes.
      writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);

      if (
        !allowEmptyOverride &&
        persistedSnapshot.messages.length === 0 &&
        lastSavedSignatureRef.current !== null &&
        signature !== lastSavedSignatureRef.current
      ) {
        return;
      }
      if (signature === lastSavedSignatureRef.current) {
        markSessionPersistSettled();
        return;
      }
      lastSavedSignatureRef.current = signature;
      try {
        await saveActiveSessionSnapshotRef.current(persistedSnapshot);
      } finally {
        markSessionPersistSettled();
      }
    };
''',
    '''    const flush = async ({ allowEmptyOverride = false }: { allowEmptyOverride?: boolean } = {}) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const persistedSnapshot =
        exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export());
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));

      // Local fallback cache: helps restore conversation state if the user closes/navigates
      // before the server PATCH completes.
      writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);

      if (
        !allowEmptyOverride &&
        persistedSnapshot.messages.length === 0 &&
        lastSavedSignatureRef.current !== null &&
        signature !== lastSavedSignatureRef.current
      ) {
        return;
      }
      if (signature === lastSavedSignatureRef.current) {
        markSessionPersistSettled();
        return;
      }
      lastSavedSignatureRef.current = signature;
      try {
        await saveActiveSessionSnapshotRef.current(persistedSnapshot);
      } finally {
        markSessionPersistSettled();
      }
    };

    const persistSettledRun = async () => {
      const generation = ++runEndPersistGenerationRef.current;

      for (const delayMs of RUN_END_PERSIST_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
        if (runEndPersistGenerationRef.current !== generation) {
          return;
        }

        try {
          await flush({ allowEmptyOverride: true });
        } catch {
          // A later retry can still succeed if the repository or API was briefly unavailable.
        }
      }

      if (
        runEndPersistGenerationRef.current === generation &&
        pendingForcePersistResolversRef.current.length > 0
      ) {
        resolvePendingForcePersists();
      }
    };
''',
)

replace_once(
    bridge,
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        markSessionPersistPending();
        // Persist immediately at run start so a quick close/reopen still restores the user message.
        void flush({ allowEmptyOverride: true });
      }),
''',
    '''      thread.unstable_on("runStart", () => {
        runActiveRef.current = true;
        runEndPersistGenerationRef.current += 1;
        markSessionPersistPending();
        // Persist immediately at run start so a quick close/reopen still restores the user message.
        void flush({ allowEmptyOverride: true });
      }),
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
    '''      thread.unstable_on("runEnd", () => {
        runActiveRef.current = false;
        markSessionPersistPending();
        void persistSettledRun();
      }),
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

Path("tests/session-run-end-persistence.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";

// Keep the retry schedule intentionally short: it bridges the adapter's final
// state publication without turning normal navigation into a long wait.
const RUN_END_PERSIST_RETRY_DELAYS_MS = [0, 50, 150, 300, 600] as const;

describe("run-end persistence retry schedule", () => {
  it("starts immediately and remains bounded", () => {
    expect(RUN_END_PERSIST_RETRY_DELAYS_MS[0]).toBe(0);
    expect(RUN_END_PERSIST_RETRY_DELAYS_MS.at(-1)).toBeLessThanOrEqual(1_000);
    expect(
      RUN_END_PERSIST_RETRY_DELAYS_MS.every(
        (delay, index) => index === 0 || delay > RUN_END_PERSIST_RETRY_DELAYS_MS[index - 1],
      ),
    ).toBe(true);
  });
});
''',
    encoding="utf-8",
)
