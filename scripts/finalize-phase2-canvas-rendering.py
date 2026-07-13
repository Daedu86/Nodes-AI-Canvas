from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:220]!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "components/assistant-ui/thread-graph-flow/canvas-stage.tsx",
    '''            key={`flow:${activeSessionId}:${graphStructureSignature}`}
''',
    '''            key={`flow:${activeSessionId}`}
            data-graph-structure={graphStructureSignature}
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/canvas-stage.tsx",
    '''            onlyRenderVisibleElements
''',
    '''            onlyRenderVisibleElements={nodes.length > 200}
''',
)

replace_once(
    "components/assistant-ui/thread-graph-flow/canvas-stage.tsx",
    '''            <div className="pointer-events-auto rounded-full border border-white/70 bg-white/82 px-3 py-1 text-[11px] text-muted-foreground shadow-[0_18px_48px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
''',
    '''            <div className="pointer-events-none rounded-full border border-white/70 bg-white/82 px-3 py-1 text-[11px] text-muted-foreground shadow-[0_18px_48px_-36px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
''',
)

replace_once(
    "tests/e2e/smoke.spec.ts",
    '''test("respects the selected local model in the request metadata", async ({ page }) => {
  await gotoChat(page);

  await page.locator("select").selectOption("ollama:gemma3:4b");
''',
    '''test("respects the selected local model in the request metadata", async ({ page }) => {
  await gotoChat(page);

  await fetchAppJson(page, "/api/llm/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        providers: {
          ollama: {
            enabled: true,
            models: ["gemma3:4b"],
          },
        },
      },
    }),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("combobox", { name: "Model" })).toContainText(
    "Ollama",
  );

  await page.locator("select").selectOption("ollama:gemma3:4b");
''',
)
