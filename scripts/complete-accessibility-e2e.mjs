import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Could not locate ${label}.`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const packagePath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts["test:a11y:e2e"] = "playwright test accessibility.spec.ts";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const configPath = "playwright.config.ts";
let config = fs.readFileSync(configPath, "utf8");
if (!config.includes("const browserName =")) {
  config = replaceOnce(
    config,
    "const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;\n",
    'const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;\nconst browserName = process.env.PLAYWRIGHT_BROWSER_NAME === "firefox" ? "firefox" : "chromium";\n',
    "Playwright browser channel declaration",
  );
}
config = config.replace(
  '    browserName: "chromium",\n    ...(browserChannel ? { channel: browserChannel } : {}),',
  '    browserName,\n    ...(browserName === "chromium" && browserChannel ? { channel: browserChannel } : {}),',
);
fs.writeFileSync(configPath, config);

const ciPath = ".github/workflows/ci.yml";
let ci = fs.readFileSync(ciPath, "utf8");
if (!ci.includes("  accessibility:\n")) {
  const anchor = "\n  canvas-performance:\n";
  const job = `
  accessibility:
    name: Accessibility E2E (\${{ matrix.browser }})
    needs: [quality, build]
    runs-on: ubuntu-latest
    timeout-minutes: 25
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox]
    env:
      PLAYWRIGHT_BROWSER_NAME: \${{ matrix.browser }}
      PLAYWRIGHT_RUN_ID: accessibility-\${{ github.run_id }}-\${{ github.run_attempt }}-\${{ matrix.browser }}
    steps:
      - name: Checkout
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install dependencies
        run: npm ci --no-audit --fund=false
      - name: Install Playwright browser
        run: npx playwright install --with-deps \${{ matrix.browser }}
      - name: Run accessibility E2E
        run: npm run test:a11y:e2e -- --workers=1
      - name: Upload accessibility failure artifacts
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: accessibility-\${{ matrix.browser }}-artifacts
          path: |
            test-results
            playwright-report
          if-no-files-found: ignore
          retention-days: 7
`;
  ci = replaceOnce(ci, anchor, `\n${job}${anchor}`, "CI canvas performance job");
}
fs.writeFileSync(ciPath, ci);

fs.writeFileSync(
  "tests/e2e/accessibility.spec.ts",
  `import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  \`http://localhost:\${process.env.PLAYWRIGHT_PORT ?? "3100"}\`;

async function fetchAppJson<T>(page: Page, input: string, init?: RequestInit) {
  const url = new URL(input, page.url()).toString();
  const { body, ...rest } = init ?? {};
  const response = await page.request.fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    ...rest,
    ...(body === undefined ? {} : { data: body }),
  });
  if (!response.ok()) {
    throw new Error(\`Request failed for \${input}: \${response.status()}\`);
  }
  return (await response.json()) as T;
}

async function resetAppData(page: Page) {
  for (const target of ["/api/projects", "/api/sessions", "/api/memory"]) {
    const response = await page.request.fetch(new URL(target, PLAYWRIGHT_BASE_URL).toString(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ all: true }),
    });
    expect([200, 204, 400, 404]).toContain(response.status());
  }

  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function ensureSignedIn(page: Page) {
  await page.goto(PLAYWRIGHT_BASE_URL, { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder("Write a message...");
  if (await composer.isVisible().catch(() => false)) return;

  const newSessionButton = page.getByRole("button", { name: "New Session" });
  if (await newSessionButton.isVisible().catch(() => false)) {
    const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await page.goto(\`/?sessionId=\${created.session.id}\`, { waitUntil: "domcontentloaded" });
    await expect(composer).toBeVisible({ timeout: 15_000 });
    return;
  }

  const loginButton = page.getByRole("button", {
    name: "Sign in with local dev credentials",
  });
  await expect(loginButton).toBeVisible({ timeout: 15_000 });
  await page.locator("#dev-email").fill(DEV_AUTH_EMAIL);
  await page.locator("#dev-password").fill(DEV_AUTH_PASSWORD);
  await loginButton.click();
  await expect(composer).toBeVisible({ timeout: 15_000 });
}

async function createAndOpenSession(page: Page) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title: "Accessibility verification" }),
  });
  await page.goto(\`/?sessionId=\${created.session.id}\`, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
}

function seriousViolations(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
}

test.beforeEach(async ({ page }) => {
  await resetAppData(page);
  await createAndOpenSession(page);
});

test("has no serious or critical axe violations in onboarding and workspace views", async ({
  page,
}) => {
  const dialog = page.getByRole("dialog", {
    name: "Turn a question into a structured decision",
  });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  const dialogResults = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousViolations(dialogResults)).toEqual([]);

  await page.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();

  const chatResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousViolations(chatResults)).toEqual([]);

  const splitButton = page.getByRole("button", {
    name: /^(Open|Exit) split workspace$/u,
  });
  if ((await splitButton.getAttribute("aria-label")) === "Open split workspace") {
    await splitButton.click();
  }
  await expect(page.getByRole("region", { name: "Conversation canvas" })).toBeVisible();

  const splitResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousViolations(splitResults)).toEqual([]);
});

test("keeps dialog focus trapped and restores it to the help trigger", async ({ page }) => {
  const dialog = page.getByRole("dialog", {
    name: "Turn a question into a structured decision",
  });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();

  const trigger = page.getByRole("button", { name: "Open workspace guide" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const openDialog = document.querySelector('[role="dialog"]');
        return Boolean(active && openDialog?.contains(active));
      }),
    )
    .toBe(true);

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        const openDialog = document.querySelector('[role="dialog"]');
        return Boolean(active && openDialog?.contains(active));
      }),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("prevents hidden workspace panels from receiving focus", async ({ page }) => {
  const dialog = page.getByRole("dialog", {
    name: "Turn a question into a structured decision",
  });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Got it" }).click();

  await page.getByRole("button", { name: "Show chat panel" }).click();
  const hiddenLayer = page.locator('[inert][aria-hidden="true"]');
  await expect(hiddenLayer).toHaveCount(1);

  const focusable = hiddenLayer.locator('button, input, textarea, select, a[href]').first();
  await expect(focusable).toBeAttached();
  await focusable.evaluate((element) => (element as HTMLElement).focus());

  expect(await hiddenLayer.evaluate((element) => element.contains(document.activeElement))).toBe(
    false,
  );
});
`,
);
