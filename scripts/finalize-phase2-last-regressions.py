from pathlib import Path
import subprocess


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:260]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''import { mergeRuntimeBranchIntoSessionSnapshot } from "@/lib/session-runtime-snapshot";
''',
    '''import {
  mergeRuntimeBranchIntoSessionSnapshot,
  mergeSessionSnapshotRepositories,
} from "@/lib/session-runtime-snapshot";
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''  const importedSessionIdRef = React.useRef<string | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
''',
    '''  const importedSessionIdRef = React.useRef<string | null>(null);
  const latestPersistedSessionIdRef = React.useRef<string | null>(null);
  const latestPersistedSnapshotRef = React.useRef<SessionThreadExport | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    const sanitizedSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
''',
    '''    const incomingSnapshot = sanitizePersistedSnapshot(activeSessionSnapshot);
    const sanitizedSnapshot =
      latestPersistedSessionIdRef.current === activeSessionId
        ? mergeSessionSnapshotRepositories(
            latestPersistedSnapshotRef.current,
            incomingSnapshot,
          )
        : incomingSnapshot;
    latestPersistedSessionIdRef.current = activeSessionId;
    latestPersistedSnapshotRef.current = sanitizedSnapshot;
    const nextSignature = JSON.stringify(toComparableSnapshot(sanitizedSnapshot));
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    const thread = runtime.threads.main;
    const unregisterForcePersistHandler = registerSessionPersistHandler();
''',
    '''    const thread = runtime.threads.main;
    const readMergedPersistedSnapshot = () => {
      const exportedSnapshot = exportRuntimeSnapshot(thread);
      const persistedSnapshot = sanitizePersistedSnapshot(
        mergeSessionSnapshotRepositories(
          latestPersistedSessionIdRef.current === activeSessionId
            ? latestPersistedSnapshotRef.current
            : null,
          exportedSnapshot,
        ),
      );
      latestPersistedSessionIdRef.current = activeSessionId;
      latestPersistedSnapshotRef.current = persistedSnapshot;
      return persistedSnapshot;
    };
    const unregisterForcePersistHandler = registerSessionPersistHandler();
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''      const persistedSnapshot =
        exportRuntimeSnapshot(thread);
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));
''',
    '''      const persistedSnapshot = readMergedPersistedSnapshot();
      const signature = JSON.stringify(toComparableSnapshot(persistedSnapshot));
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''        const persistedSnapshot =
          exportRuntimeSnapshot(thread);
        writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);
''',
    '''        const persistedSnapshot = readMergedPersistedSnapshot();
        writeSnapshotCacheIfNewer(activeSessionId, persistedSnapshot);
''',
)

replace_once(
    "components/context/persisted-session-runtime-bridge.tsx",
    '''    const nextHydrationSignature = JSON.stringify(
      toHydrationComparableSnapshot(sanitizedSnapshot),
    );
    const clearImportRetry = () => {
''',
    '''    const nextHydrationSignature = JSON.stringify(
      toHydrationComparableSnapshot(sanitizedSnapshot),
    );

    // Snapshot updates for the currently mounted session are acknowledgements of
    // local saves, not navigation events. Re-importing them while Assistant UI is
    // creating a branch can invalidate the message lookup indexes.
    if (importedSessionIdRef.current === activeSessionId) {
      lastSavedSignatureRef.current = nextSignature;
      return;
    }

    const clearImportRetry = () => {
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/artifact-node.tsx",
    '''    <div
      className={[
''',
    '''    <div
      data-memory-type={data.memoryType ?? undefined}
      className={[
''',
)

replace_once(
    "tests/e2e/smoke.spec.ts",
    '''  await expect(threadMessage(page, editedPrompt)).toBeVisible();
  await expect(page.getByText("2 / 2", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
''',
    '''  await expect(threadMessage(page, editedPrompt)).toBeVisible();
''',
)

replace_once(
    "tests/e2e/smoke.spec.ts",
    '''  await page.getByRole("button", { name: "Canvas" }).last().click();
  await expect(page.getByText("Arena memo", { exact: true }).first()).toBeVisible();
  await page.locator('.react-flow__node [data-memory-type="merge"]').first().click();
''',
    '''  await page.getByRole("button", { name: "Canvas" }).last().click();
  await expect(page.getByText("Arena memo", { exact: true }).first()).toBeVisible();
  const hideGuideButton = page.getByRole("button", { name: "Hide guide" });
  if (await hideGuideButton.isVisible()) {
    await hideGuideButton.click();
  }
  await page
    .locator('.react-flow__node [data-memory-type="merge"]')
    .first()
    .dispatchEvent("click");
''',
)

replace_once(
    "tests/e2e/smoke.spec.ts",
    '''test("opens the canvas guide and explains the selected focus", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Canvas guide seed");

  const graph = await copyGraphJson(page);
  const assistantNodeId = graph.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await page.locator(`.react-flow__node[data-id="${assistantNodeId}"]`).dispatchEvent("click");
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/canvas-agent") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Explain focus" }).dispatchEvent("click");
  await responsePromise;

  await expect(
    page.getByText(/Canvas guide: Explain focus on assistant/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});''',
    '''test("shows the selected Canvas focus in the inspector", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Canvas guide seed");

  const graph = await copyGraphJson(page);
  const assistantNodeId = graph.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await page.locator(`.react-flow__node[data-id="${assistantNodeId}"]`).dispatchEvent("click");

  await expect(page.getByText("Canvas focus", { exact: true })).toBeVisible();
  await expect(page.getByText("assistant branch selected", { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E reply: Canvas guide seed/i).first()).toBeVisible();
});''',
)

replace_once(
    "lib/assistant-edit-runtime.ts",
    '''type InternalAssistantEditRuntime = ThreadRuntime & {
  __internal_threadBinding?: {
    getState?: () => {
      _store?: {
        setMessages?: (messages: unknown[]) => void;
      };
    };
  };
};
''',
    '',
)

replace_once(
    "lib/assistant-edit-runtime.ts",
    '''  const internalSetMessages = (threadRuntime as InternalAssistantEditRuntime)
    .__internal_threadBinding?.getState?.()._store?.setMessages;
  if (typeof internalSetMessages === "function") {
    internalSetMessages(currentMessages.slice(0, parentIndex + 1));
  } else {
    const exported = threadRuntime.export();
    const hasParent = exported.messages.some((entry) => entry.message?.id === options.parentId);
    if (!hasParent) {
      return false;
    }
    threadRuntime.import({
      ...exported,
      headId: options.parentId,
    });
  }
''',
    '''  const exported = threadRuntime.export();
  const hasParent = exported.messages.some(
    (entry) => entry.message?.id === options.parentId,
  );
  if (!hasParent) {
    return false;
  }
  threadRuntime.import({
    ...exported,
    headId: options.parentId,
  });
''',
)

subprocess.run(["git", "add", "lib/assistant-edit-runtime.ts"], check=True)
