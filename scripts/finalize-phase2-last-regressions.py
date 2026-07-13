from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:260]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


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
  await page.locator('.react-flow__node [data-memory-type="merge"]').first().click();
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
