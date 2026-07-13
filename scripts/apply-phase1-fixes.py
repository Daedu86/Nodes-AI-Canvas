from pathlib import Path
import re


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


def replace_pattern(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern[:120]!r}")
    write(path, updated)


replace_once(
    "lib/server/chat/request.ts",
    'const historyModeSchema = z.enum(["last", "full"]);\nconst boundedIdentifierSchema = z.string().trim().min(1).max(256);',
    'const historyModeSchema = z.enum(["last", "full"]);\nconst chatTriggerSchema = z.enum(["submit-message", "regenerate-message"]);\nconst boundedIdentifierSchema = z.string().trim().min(1).max(256);',
)
replace_once(
    "lib/server/chat/request.ts",
    """  .object({
    messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES).default([]),
    system: z.string().max(MAX_SYSTEM_CHARS).optional(),
    tools: toolsSchema.optional(),""",
    """  .object({
    id: boundedIdentifierSchema.optional(),
    messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES).default([]),
    system: z.string().max(MAX_SYSTEM_CHARS).optional(),
    tools: toolsSchema.optional(),
    trigger: chatTriggerSchema.optional(),""",
)

replace_once(
    "tests/chat-request.test.ts",
    """  it("accepts the current Assistant UI request envelope", () => {
    const result = chatRequestBodySchema.safeParse({
      messages: [""",
    """  it("accepts the current Assistant UI request envelope", () => {
    const result = chatRequestBodySchema.safeParse({
      id: "request-1",
      trigger: "submit-message",
      messages: [""",
)
replace_pattern(
    "tests/chat-request.test.ts",
    r'  it\("rejects invalid providers, history modes, and empty messages", \(\) => \{.*?\n  \}\);',
    """  it("accepts supported transport triggers and rejects invalid request values", () => {
    expect(
      chatRequestBodySchema.safeParse({
        id: "request-2",
        trigger: "regenerate-message",
        messages: [validMessage],
      }).success,
    ).toBe(true);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        trigger: "unsupported-trigger",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        provider: "unknown-provider",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [validMessage],
        historyMode: "summary",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [{ id: "empty", role: "user" }],
      }).success,
    ).toBe(false);
  });""",
)

replace_once(
    "app/assistant.tsx",
    """        recordPendingLatency(messageId);
        setRequestError(null);
      } catch {
        pendingLatencyRef.current = null;
        setRequestError(null);
      }""",
    """        recordPendingLatency(messageId);
      } catch {
        pendingLatencyRef.current = null;
      }""",
)

replace_once(
    "lib/server/e2e-auth.ts",
    """export function isE2eHeaderAuthAllowed() {
  return process.env.NODE_ENV === "test";
}""",
    """export function isE2eHeaderAuthAllowed() {
  if (isProductionLikeRuntime()) {
    return false;
  }
  return process.env.NODE_ENV === "test" || isE2eEnvAuthAllowed();
}""",
)

write(
    "tests/e2e-auth.test.ts",
    '''import { afterEach, describe, expect, it } from "vitest";
import {
  isE2eEnvAuthAllowed,
  isE2eHeaderAuthAllowed,
  isProductionLikeRuntime,
} from "../lib/server/e2e-auth";

const originalNodeEnv = process.env.NODE_ENV;

describe("e2e auth guardrails", () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.ALLOW_E2E_AUTH_OVERRIDE;
    delete process.env.E2E_MOCK_LLM;
    delete process.env.VERCEL_ENV;
  });

  it("allows header-based test auth in the test runtime", () => {
    expect(isE2eHeaderAuthAllowed()).toBe(true);
  });

  it("allows header identities in an explicitly enabled non-production E2E server", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_E2E_AUTH_OVERRIDE = "1";
    process.env.E2E_MOCK_LLM = "1";

    expect(isE2eEnvAuthAllowed()).toBe(true);
    expect(isE2eHeaderAuthAllowed()).toBe(true);
  });

  it("requires an explicit flag for env-based auth overrides", () => {
    process.env.NODE_ENV = "development";
    process.env.E2E_MOCK_LLM = "1";
    expect(isE2eEnvAuthAllowed()).toBe(false);
    process.env.ALLOW_E2E_AUTH_OVERRIDE = "1";
    expect(isE2eEnvAuthAllowed()).toBe(true);
  });

  it("blocks all E2E auth overrides in production-like runtimes", () => {
    process.env.ALLOW_E2E_AUTH_OVERRIDE = "1";
    process.env.E2E_MOCK_LLM = "1";
    process.env.VERCEL_ENV = "production";

    expect(isProductionLikeRuntime()).toBe(true);
    expect(isE2eEnvAuthAllowed()).toBe(false);
    expect(isE2eHeaderAuthAllowed()).toBe(false);
  });
});
''',
)

for path in [Path("playwright.config.ts"), *Path("tests/e2e").glob("*.ts")]:
    text = path.read_text(encoding="utf-8")
    text = text.replace("nvidia/nemotron-3-super-120b-a12b:free", "openrouter/free")
    text = text.replace("OpenRouter · Nemotron Nano 12B V2 VL (free)", "OpenRouter · Free Router")
    path.write_text(text, encoding="utf-8")

replace_once(
    "tests/e2e/session-return-send.spec.ts",
    """  // Simulate leaving the chat (for example: opening Knowledge Center).
  await page.getByRole("button", { name: "Knowledge Center" }).click();
  await expect(page.getByRole("heading", { name: "Knowledge Center" })).toBeVisible({
    timeout: 15_000,
  });""",
    """  // Leave the session surface through a current profile workspace.
  await page.getByRole("button", { name: "LLM Models" }).click();
  await expect(page.getByRole("heading", { name: "LLM Models" })).toBeVisible({
    timeout: 15_000,
  });""",
)

replace_pattern(
    "tests/e2e/chat-image-attachment.spec.ts",
    r'test\("send is blocked while an image is still preparing", async \(\{ page \}\) => \{.*?\n\}\);',
    '''test("send is blocked while an image is still preparing", async ({ page }) => {
  const filePath = test.info().outputPath("pixel.png");
  await fs.writeFile(filePath, Buffer.from(PIXEL_PNG_BASE64, "base64"));

  await page.evaluate(() => {
    const originalReadAsDataUrl = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      window.setTimeout(() => originalReadAsDataUrl.call(this, blob), 500);
    };
  });

  await page.getByRole("button", { name: "Attach image" }).click();
  await page.getByTestId("chat-image-input").setInputFiles(filePath);

  const sendButton = page.getByRole("button", { name: "Send" });
  await expect(sendButton).toBeDisabled();
  await expect(page.getByTestId("composer-image-preview")).toBeVisible();
  await expect(sendButton).toBeEnabled({ timeout: 5_000 });
});''',
)

replace_pattern(
    "tests/e2e/smoke.spec.ts",
    r'test\("creates the first prompt directly from an empty flow canvas", async \(\{ page \}\) => \{.*?(?=\ntest\()',
    '''test("runs the first prompt directly from an empty flow canvas", async ({ page }) => {
  await gotoChat(page);
  await page.getByRole("button", { name: "Show canvas panel" }).click();
  const createPromptButton = page.getByRole("button", { name: "Create prompt node" });
  await expect(createPromptButton).toBeVisible({ timeout: 15_000 });

  await createPromptButton.click();
  const promptNode = page
    .locator(".react-flow__node")
    .filter({ has: page.getByRole("textbox", { name: "Canvas prompt" }) })
    .last();
  await expect(promptNode).toBeVisible({ timeout: 15_000 });
  await promptNode.getByRole("textbox", { name: "Canvas prompt" }).fill("Canvas first prompt");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/canvas-runs") &&
      response.request().method() === "POST",
  );
  await promptNode.getByRole("button", { name: "Run canvas prompt" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(promptNode).toContainText("Mock canvas response: Canvas first prompt", {
    timeout: 15_000,
  });

  const activeSessionId = await getActiveSessionId(page);
  expect(activeSessionId).toBeTruthy();
  const persisted = await fetchAppJson<{
    session: {
      artifacts: Array<{
        artifactType: string;
        content: string;
        promptResult?: string | null;
        promptStatus?: string | null;
      }>;
    };
  }>(page, `/api/sessions/${activeSessionId}`);
  const promptArtifact = persisted.session.artifacts.find(
    (artifact) => artifact.artifactType === "prompt" && artifact.content === "Canvas first prompt",
  );
  expect(promptArtifact).toMatchObject({
    promptResult: "Mock canvas response: Canvas first prompt",
    promptStatus: "completed",
  });
});
''',
)

stale_terms = {
    "tests/e2e/session-return-send.spec.ts": ["Knowledge Center"],
    "tests/e2e/chat-image-attachment.spec.ts": ["Nemotron Nano 12B V2 VL"],
    "playwright.config.ts": ["nvidia/nemotron-3-super-120b-a12b:free"],
}
for path, terms in stale_terms.items():
    text = read(path)
    for term in terms:
        if term in text:
            raise SystemExit(f"Stale E2E expectation remains in {path}: {term}")
