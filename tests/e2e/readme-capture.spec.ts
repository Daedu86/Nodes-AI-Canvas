import { expect, test } from "@playwright/test";

if (!process.env.README_CAPTURE) {
  test.skip(true, "README screenshot capture only runs when README_CAPTURE=1");
}

type Page = import("@playwright/test").Page;

type SeedMessage = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  text: string;
};

async function fetchAppJson<T>(page: Page, input: string, init?: RequestInit) {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;
  const currentUrl = page.url();
  const url = new URL(input, currentUrl.startsWith("http") ? currentUrl : baseUrl).toString();
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${input}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function seedMessage({ id, parentId, role, text }: SeedMessage) {
  const createdAt = "2026-04-01T11:00:00.000Z";
  return {
    parentId,
    message: {
      id,
      createdAt,
      role,
      content: [
        {
          type: "text",
          text,
        },
      ],
      ...(role === "assistant"
        ? {
            metadata: {
              unstable_state: null,
              unstable_annotations: [],
              unstable_data: [],
              custom: {},
              steps: [],
              timing: {
                firstTokenTime: 120,
                streamStartTime: 1775037074541,
                tokenCount: Math.max(12, text.split(/\s+/).length),
                tokensPerSecond: 90,
                toolCallCount: 0,
                totalChunks: 1,
                totalStreamTime: 360,
              },
            },
            status: {
              reason: "unknown",
              type: "complete",
            },
          }
        : {
            attachments: [],
            metadata: {
              custom: {},
            },
          }),
    },
  };
}

async function createSeededSession(
  page: Page,
  {
    messages,
    title,
  }: {
    messages: SeedMessage[];
    title: string;
  },
) {
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

  const headId = messages.at(-1)?.id ?? null;
  await fetchAppJson(page, `/api/sessions/${created.session.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      snapshot: {
        headId,
        messages: messages.map((message) => seedMessage(message)),
      },
      title,
    }),
  });

  return created.session.id;
}

async function createMemoryItem(
  page: Page,
  {
    content,
    title,
    type,
  }: {
    content: string;
    title: string;
    type: string;
  },
) {
  const created = await fetchAppJson<{ item: { id: string } }>(page, "/api/memory", {
    method: "POST",
    body: JSON.stringify({ content, title, type }),
  });
  return created.item.id;
}

async function resetDemoData(page: Page) {
  const cleanupTargets = ["/api/projects", "/api/sessions", "/api/memory"];

  for (const target of cleanupTargets) {
    await fetch(new URL(target, process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3100"}`), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function openProject(page: Page, title: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(title, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByText(title, { exact: false }).first().click();
  await expect(page.getByRole("button", { name: "Canvas" }).first()).toBeVisible({ timeout: 15_000 });
}

async function createSeededProject(
  page: Page,
  {
    arenaWinnerSessionId,
    sessionIds,
    title,
  }: {
    arenaWinnerSessionId?: string | null;
    sessionIds: string[];
    title: string;
  },
) {
  const created = await fetchAppJson<{ project: { id: string } }>(page, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ sessionIds, title }),
  });

  if (arenaWinnerSessionId) {
    await fetchAppJson(page, `/api/projects/${created.project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ arenaWinnerSessionId }),
    });
  }

  return created.project.id;
}

async function applyReadmePolish(page: Page) {
  await page.addStyleTag({
    content: `
      .react-flow {
        background:
          radial-gradient(circle at 18% 18%, rgba(56, 189, 248, 0.16), transparent 24%),
          radial-gradient(circle at 82% 14%, rgba(14, 165, 233, 0.12), transparent 22%),
          radial-gradient(circle at 50% 82%, rgba(168, 85, 247, 0.1), transparent 26%),
          linear-gradient(180deg, #0b1220 0%, #0f172a 52%, #111827 100%) !important;
      }
      .react-flow__pane,
      .react-flow__viewport,
      .react-flow__renderer {
        background: transparent !important;
      }
      .react-flow__background {
        opacity: 0.45 !important;
      }
      .react-flow__background path {
        stroke: rgba(148, 163, 184, 0.18) !important;
      }
      .react-flow__node > div {
        background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.94)) !important;
        border-color: rgba(148, 163, 184, 0.2) !important;
        box-shadow: 0 24px 54px -30px rgba(2, 6, 23, 0.7) !important;
      }
      .react-flow__node > div > div {
        background: linear-gradient(180deg, rgba(30, 41, 59, 0.94), rgba(15, 23, 42, 0.92)) !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      .react-flow__node > div > div {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.96)) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      .react-flow__node p,
      .react-flow__node span,
      .react-flow__node div {
        text-shadow: none !important;
      }
      .react-flow__node p {
        color: rgba(15, 23, 42, 0.92) !important;
      }
      .react-flow__node [class*="text-foreground"] {
        color: rgba(15, 23, 42, 0.94) !important;
      }
      .react-flow__node [class*="text-muted-foreground"] {
        color: rgba(71, 85, 105, 0.88) !important;
      }
      .react-flow__node [class*="bg-muted"] {
        background: rgba(226, 232, 240, 0.78) !important;
      }
      .react-flow__node [class*="border-border"] {
        border-color: rgba(148, 163, 184, 0.24) !important;
      }
      .react-flow__edge path {
        filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.15));
      }
      .react-flow__controls,
      .react-flow__minimap {
        filter: drop-shadow(0 10px 24px rgba(15, 23, 42, 0.14));
      }
      .react-flow__controls-button,
      .react-flow__controls button {
        background: rgba(15, 23, 42, 0.92) !important;
        color: #eff6ff !important;
        border-color: rgba(148, 163, 184, 0.32) !important;
      }
      .react-flow__attribution,
      [data-sonner-toaster],
      [data-sonner-toast],
      [role="alert"],
      [role="status"],
      a[href*="github.com"] {
        display: none !important;
      }
      body::after {
        content: "";
        position: fixed;
        left: 0;
        bottom: 0;
        width: 172px;
        height: 72px;
        background: #0a0d14;
        border-top-right-radius: 14px;
        z-index: 2147483647;
        pointer-events: none;
      }
    `,
  });

  await page.evaluate(() => {
    for (const anchor of Array.from(document.querySelectorAll("a"))) {
      const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text.includes("GitHub") || text.includes("View Source")) {
        (anchor as HTMLElement).style.display = "none";
      }
    }

    for (const element of Array.from(document.querySelectorAll("body *"))) {
      const htmlElement = element as HTMLElement;
      const text = htmlElement.innerText?.replace(/\s+/g, " ").trim() ?? "";
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      const isToastZone =
        rect.left < 220 &&
        rect.bottom > window.innerHeight - 220 &&
        rect.width < 260 &&
        rect.height < 120;
      if ((style.position === "fixed" || style.position === "sticky" || isToastZone) && /\bIssue\b/i.test(text)) {
        htmlElement.style.display = "none";
      }
    }
  });
}

test("captures a cleaner workspace hero screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 980 });
  await resetDemoData(page);
  const productSessionId = await createSeededSession(page, {
    title: "Product Strategy",
    messages: [
      {
        id: "msg-user-product",
        parentId: null,
        role: "user",
        text: "Map the strongest directions for AI Canvas",
      },
      {
        id: "msg-assistant-product",
        parentId: "msg-user-product",
        role: "assistant",
        text: "Lead with branching, project synthesis, and reusable memory so the workspace feels purpose-built for decisions instead of one-off prompts.",
      },
    ],
  });
  const technicalSessionId = await createSeededSession(page, {
    title: "Technical Plan",
    messages: [
      {
        id: "msg-user-technical",
        parentId: null,
        role: "user",
        text: "Outline the strongest technical plan",
      },
      {
        id: "msg-assistant-technical",
        parentId: "msg-user-technical",
        role: "assistant",
        text: "Use typed nodes, reusable memory, and a project-level context builder to turn multiple sessions into a coherent workspace.",
      },
    ],
  });
  const decisionMemoryId = await createMemoryItem(page, {
    content: "Decision: focus the product on comparing and merging AI paths, not on maximizing chat features.",
    title: "Positioning decision",
    type: "decision",
  });
  const projectId = await createSeededProject(page, {
    arenaWinnerSessionId: technicalSessionId,
    sessionIds: [productSessionId, technicalSessionId],
    title: "AI Canvas Workspace",
  });
  await fetchAppJson(page, `/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ memoryIds: [decisionMemoryId] }),
  });

  await openProject(page, "AI Canvas Workspace");

  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await applyReadmePolish(page);
  await page.screenshot({
    path: "docs/screenshots/workspace-hero.png",
    fullPage: false,
  });
});

test("captures a project canvas screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 980 });
  await resetDemoData(page);
  const researchSessionId = await createSeededSession(page, {
    title: "Research Path",
    messages: [
      {
        id: "msg-user-research",
        parentId: null,
        role: "user",
        text: "Summarize the strongest user-facing story",
      },
      {
        id: "msg-assistant-research",
        parentId: "msg-user-research",
        role: "assistant",
        text: "The strongest story is that teams can compare multiple AI paths before committing to one direction.",
      },
    ],
  });
  const deliverySessionId = await createSeededSession(page, {
    title: "Delivery Path",
    messages: [
      {
        id: "msg-user-delivery",
        parentId: null,
        role: "user",
        text: "Summarize the strongest implementation path",
      },
      {
        id: "msg-assistant-delivery",
        parentId: "msg-user-delivery",
        role: "assistant",
        text: "Center the workspace around project arena, typed nodes, and reusable memory so conclusions stay visible across sessions.",
      },
    ],
  });
  const summaryMemoryId = await createMemoryItem(page, {
    content: "Summary: keep the project canvas readable by lifting important conclusions into typed nodes.",
    title: "Canvas summary",
    type: "summary",
  });
  const mergeMemoryId = await createMemoryItem(page, {
    content: "Merge: combine the user-facing story and the delivery path into one decision-ready project context.",
    title: "Project merge",
    type: "merge",
  });
  const projectId = await createSeededProject(page, {
    arenaWinnerSessionId: deliverySessionId,
    sessionIds: [researchSessionId, deliverySessionId],
    title: "Canvas Detail",
  });
  await fetchAppJson(page, `/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ memoryIds: [summaryMemoryId, mergeMemoryId] }),
  });

  await openProject(page, "Canvas Detail");

  await expect(page.locator(".react-flow__node").nth(2)).toBeVisible();
  await applyReadmePolish(page);
  await page.locator(".react-flow").first().screenshot({
    path: "docs/screenshots/project-canvas.png",
  });
});

test("captures a cleaner project arena screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 980 });
  await resetDemoData(page);
  const productSessionId = await createSeededSession(page, {
    title: "Product Direction",
    messages: [
      {
        id: "msg-product-user",
        parentId: null,
        role: "user",
        text: "Explore the product direction",
      },
      {
        id: "msg-product-assistant",
        parentId: "msg-product-user",
        role: "assistant",
        text: "Position the product as a branching decision workspace, not another chat surface.",
      },
    ],
  });
  const technicalSessionId = await createSeededSession(page, {
    title: "Technical Direction",
    messages: [
      {
        id: "msg-tech-user",
        parentId: null,
        role: "user",
        text: "Explore the technical direction",
      },
      {
        id: "msg-tech-assistant",
        parentId: "msg-tech-user",
        role: "assistant",
        text: "Lean on projects, typed nodes, and merge nodes so the workspace can synthesize multiple conversations into one shared context.",
      },
    ],
  });
  await createSeededProject(page, {
    sessionIds: [productSessionId, technicalSessionId],
    title: "Direction Project",
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByText("Direction Project", { exact: true }).click();
  await page.getByRole("button", { name: "Arena" }).first().click();

  await expect(page.getByRole("heading", { name: "Project Arena" })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "Arena Synthesis" }).first()).toBeVisible();
  await applyReadmePolish(page);

  await page.screenshot({
    path: "docs/screenshots/project-arena.png",
    fullPage: false,
  });
});

test("captures a project context builder screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 980 });
  await resetDemoData(page);
  const researchSessionId = await createSeededSession(page, {
    title: "Market Research",
    messages: [
      {
        id: "msg-research-user",
        parentId: null,
        role: "user",
        text: "Summarize the strongest user-facing story",
      },
      {
        id: "msg-research-assistant",
        parentId: "msg-research-user",
        role: "assistant",
        text: "The strongest story is that teams can explore multiple AI paths before committing to a single direction.",
      },
    ],
  });
  const technicalPlanSessionId = await createSeededSession(page, {
    title: "Technical Plan",
    messages: [
      {
        id: "msg-plan-user",
        parentId: null,
        role: "user",
        text: "Summarize the strongest implementation path",
      },
      {
        id: "msg-plan-assistant",
        parentId: "msg-plan-user",
        role: "assistant",
        text: "Start with typed nodes, reusable memory, and a project-level context builder to connect sessions into one decision workflow.",
      },
    ],
  });
  await createSeededProject(page, {
    arenaWinnerSessionId: technicalPlanSessionId,
    sessionIds: [researchSessionId, technicalPlanSessionId],
    title: "Builder Project",
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByText("Builder Project", { exact: true }).click();

  const contextSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Global Context" }) })
    .first();
  await expect(contextSection).toBeVisible();
  await contextSection.getByRole("button", { name: "Select defaults" }).click();
  await expect(contextSection.getByText("Builder preview")).toBeVisible();

  await contextSection.screenshot({
    path: "docs/screenshots/project-context-builder.png",
  });
});
