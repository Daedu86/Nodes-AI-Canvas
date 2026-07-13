from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new))


helper_path = Path("lib/session-snapshot-preference.ts")
helper_path.write_text(
    '''import type { SessionThreadExport } from "@/lib/session-documents";

const messageRole = (entry: SessionThreadExport["messages"][number]) =>
  typeof entry.message.role === "string" ? entry.message.role : null;

const snapshotScore = (snapshot: SessionThreadExport) => {
  const assistantMessages = snapshot.messages.filter(
    (entry) => messageRole(entry) === "assistant",
  ).length;
  return {
    assistantMessages,
    messages: snapshot.messages.length,
  };
};

export const selectPreferredSessionSnapshot = (
  externalSnapshot: SessionThreadExport | null,
  runtimeSnapshot: SessionThreadExport | null,
): SessionThreadExport | null => {
  if (!externalSnapshot) return runtimeSnapshot;
  if (!runtimeSnapshot) return externalSnapshot;

  const externalScore = snapshotScore(externalSnapshot);
  const runtimeScore = snapshotScore(runtimeSnapshot);

  if (runtimeScore.messages !== externalScore.messages) {
    return runtimeScore.messages > externalScore.messages
      ? runtimeSnapshot
      : externalSnapshot;
  }

  if (runtimeScore.assistantMessages !== externalScore.assistantMessages) {
    return runtimeScore.assistantMessages > externalScore.assistantMessages
      ? runtimeSnapshot
      : externalSnapshot;
  }

  // External UIMessage state remains the preferred representation when both
  // exports contain the same conversation. The runtime export is only used to
  // recover messages omitted by the external adapter.
  return externalSnapshot;
};
''',
    encoding="utf-8",
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    'import type { SessionThreadExport } from "@/lib/session-documents";\n',
    'import type { SessionThreadExport } from "@/lib/session-documents";\nimport { selectPreferredSessionSnapshot } from "@/lib/session-snapshot-preference";\n',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
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

const exportPreferredSnapshot = (
  thread: AssistantRuntime["threads"]["main"],
): SessionThreadExport => {
  const externalSnapshot = exportExternalStateAsSnapshot(thread);
  let runtimeSnapshot: SessionThreadExport | null = null;

  try {
    runtimeSnapshot = toPersistedSnapshot(thread.export());
  } catch {
    // The runtime can temporarily be a remote-thread placeholder during mount.
  }

  const preferredSnapshot = selectPreferredSessionSnapshot(
    externalSnapshot,
    runtimeSnapshot,
  );
  if (!preferredSnapshot) {
    throw new Error("The assistant runtime did not expose a persistable snapshot.");
  }
  return preferredSnapshot;
};
''',
)

replace_all(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''exportExternalStateAsSnapshot(runtime.threads.main) ??
          toPersistedSnapshot(runtime.threads.main.export())''',
    '''exportPreferredSnapshot(runtime.threads.main)''',
    expected=2,
)

replace_all(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''exportExternalStateAsSnapshot(thread) ?? toPersistedSnapshot(thread.export())''',
    '''exportPreferredSnapshot(thread)''',
    expected=2,
)

Path("tests/session-snapshot-preference.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";
import type { SessionThreadExport } from "../lib/session-documents";
import { selectPreferredSessionSnapshot } from "../lib/session-snapshot-preference";

const snapshot = (...roles: Array<"user" | "assistant">): SessionThreadExport => ({
  headId: roles.length > 0 ? `message-${roles.length}` : null,
  messages: roles.map((role, index) => ({
    parentId: index === 0 ? null : `message-${index}`,
    message: {
      id: `message-${index + 1}`,
      role,
      parts: [{ type: "text", text: `${role}-${index + 1}` }],
    },
  })),
});

describe("selectPreferredSessionSnapshot", () => {
  it("uses the runtime export when the external adapter omits an assistant reply", () => {
    const external = snapshot("user");
    const runtime = snapshot("user", "assistant");

    expect(selectPreferredSessionSnapshot(external, runtime)).toBe(runtime);
  });

  it("keeps the external UIMessage representation when both exports are complete", () => {
    const external = snapshot("user", "assistant");
    const runtime = snapshot("user", "assistant");

    expect(selectPreferredSessionSnapshot(external, runtime)).toBe(external);
  });

  it("falls back to whichever export is available", () => {
    const runtime = snapshot("user", "assistant");

    expect(selectPreferredSessionSnapshot(null, runtime)).toBe(runtime);
    expect(selectPreferredSessionSnapshot(runtime, null)).toBe(runtime);
    expect(selectPreferredSessionSnapshot(null, null)).toBeNull();
  });
});
''',
    encoding="utf-8",
)
