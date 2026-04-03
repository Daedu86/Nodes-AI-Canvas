import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const DEV_AUTH_EMAIL = process.env.AUTH_DEV_EMAIL || "demo@nodes.local";
const DEV_AUTH_PASSWORD = process.env.AUTH_DEV_PASSWORD || "dev-password";
const TEST_AUTH_USER_ID = process.env.E2E_AUTH_USER_ID || "e2e-user";
const ACTIVE_SESSION_KEY = `nodes.active-session-id.${TEST_AUTH_USER_ID}`;
const ACTIVE_PROJECT_KEY = `nodes.active-project-id.${TEST_AUTH_USER_ID}`;
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`;

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnNn1sAAAAASUVORK5CYII=",
  "base64",
);

type ReplyOptions = {
  history?: "last" | "full";
  provider?: string;
  model?: string;
  count?: number;
  contextCount?: number;
  contextTitles?: string[];
};

function expectedReply(
  prompt: string,
  {
    history = "last",
    provider = "openrouter",
    model = "nvidia/nemotron-3-super-120b-a12b:free",
    count = 1,
    contextCount = 0,
    contextTitles = [],
  }: ReplyOptions = {},
) {
  const contextSuffix =
    contextCount > 0 ? ` context=${contextCount} contextTitles=${contextTitles.join("|")}` : "";
  return `E2E reply: ${prompt} [provider=${provider} model=${model} history=${history} count=${count}${contextSuffix}]`;
}

function threadMessage(page: Page, text: string) {
  return page.locator("[data-message-id]").filter({ hasText: text }).first();
}

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
  if (!response.ok) {
    throw new Error(`Request failed for ${input}: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function resetAppData(page: Page) {
  const cleanupTargets = ["/api/projects", "/api/sessions", "/api/memory"];

  for (const target of cleanupTargets) {
    const response = await page.request.fetch(new URL(target, PLAYWRIGHT_BASE_URL).toString(), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify({ all: true }),
    });
    if (!response.ok() && response.status() !== 400 && response.status() !== 404) {
      throw new Error(`Cleanup failed for ${target}: ${response.status()}`);
    }
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function getActiveSessionId(page: Page) {
  const currentUrl = page.url();
  if (currentUrl.startsWith("http")) {
    const sessionId = new URL(currentUrl).searchParams.get("sessionId");
    if (sessionId) {
      return sessionId;
    }
  }
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), ACTIVE_SESSION_KEY);
}

async function getActiveProjectId(page: Page) {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), ACTIVE_PROJECT_KEY);
}

async function ensureSignedIn(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder("Write a message...");
  if (await composer.isVisible().catch(() => false)) {
    return;
  }

  const newSessionButton = page.getByRole("button", { name: "New Session" });
  if (await newSessionButton.isVisible().catch(() => false)) {
    const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
    await expect(composer).toBeVisible({ timeout: 15_000 });
    return;
  }

  const loginButton = page.getByRole("button", { name: "Sign in with local dev credentials" });
  await expect(loginButton).toBeVisible({ timeout: 15_000 });
  const emailInput = page.locator("#dev-email");
  const passwordInput = page.locator("#dev-password");
  await emailInput.fill(DEV_AUTH_EMAIL);
  await passwordInput.fill(DEV_AUTH_PASSWORD);
  await expect(emailInput).toHaveValue(DEV_AUTH_EMAIL);
  await expect(passwordInput).toHaveValue(DEV_AUTH_PASSWORD);
  await loginButton.click();
  await expect(composer).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await resetAppData(page);
});

async function gotoChat(page: Page, options?: { title?: string }) {
  await ensureSignedIn(page);
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify(options?.title ? { title: options.title } : {}),
  });
  await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
  const composer = page.getByPlaceholder("Write a message...");
  await expect(composer).toBeVisible({ timeout: 15_000 });
}

async function createAndOpenSession(page: Page) {
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({}),
  });
  await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
  return created.session.id;
}

async function createAndOpenNamedSession(page: Page, title: string) {
  const created = await fetchAppJson<{ session: { id: string } }>(page, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  await page.goto(`/?sessionId=${created.session.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
  return created.session.id;
}

async function sendPrompt(
  page: Page,
  prompt: string,
  options?: ReplyOptions,
) {
  const composer = page.getByPlaceholder("Write a message...");
  await composer.fill(prompt);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Chat request failed with ${response.status()}: ${await response.text()}`);
  }

  const reply = expectedReply(prompt, options);
  await expect(threadMessage(page, prompt)).toBeVisible();
  await expect(threadMessage(page, reply)).toBeVisible({
    timeout: 15_000,
  });
  return reply;
}


async function copyGraphJson(page: Page) {
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.getByRole("button", { name: /Copy JSON/i }).click();
  const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
  return JSON.parse(clipboardText) as {
    artifacts?: Array<{ id: string; title: string; type: string }>;
    contextLinks?: Array<{ artifactId: string; targetMessageId: string }>;
    nodes: Array<{ id: string; role: string; parentId: string | null; isBridge?: boolean }>;
    connectors: Array<{ parentId: string | null; childId: string; description?: string }>;
  };
}

async function listSessionIds(page: Page) {
  const data = await fetchAppJson<{
    sessions: Array<{ id: string }>;
  }>(page, "/api/sessions");
  return data.sessions.map((session) => session.id);
}

async function fetchSessionDocument(page: Page, sessionId: string) {
  return fetchAppJson<{
    session: {
      snapshot: {
        headId: string | null;
        messages: Array<{
          parentId: string | null;
          message: { id: string; role: string };
        }>;
      };
    };
  }>(page, `/api/sessions/${sessionId}`);
}

async function fetchPersistedSession(page: Page, sessionId: string) {
  return fetchAppJson<{
    session: {
      artifacts: Array<{ id: string; title: string; artifactType?: string }>;
      contextLinks: Array<{ artifactId: string; targetMessageId: string }>;
      snapshot: {
        messages: Array<{
          parentId: string | null;
          message: Record<string, unknown>;
        }>;
      };
    };
  }>(page, `/api/sessions/${sessionId}`);
}

async function listProjectIds(page: Page) {
  const data = await fetchAppJson<{
    projects: Array<{ id: string }>;
  }>(page, "/api/projects");
  return data.projects.map((project) => project.id);
}

async function createProjectFromSessions(
  page: Page,
  sessionIds: string[],
  title: string,
) {
  const created = await fetchAppJson<{ project: { id: string } }>(page, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ sessionIds, title }),
  });
  return created.project.id;
}

async function openProjectById(page: Page, projectId: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ storageKey, nextProjectId }) => {
      window.localStorage.setItem(storageKey, nextProjectId);
    },
    { storageKey: ACTIVE_PROJECT_KEY, nextProjectId: projectId },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Back to sessions" })).toBeVisible({
    timeout: 15_000,
  });
}

async function editAssistantReply(
  page: Page,
  currentReply: string,
  editedPrompt: string,
) {
  const assistantMessage = page.locator("[data-message-id]").filter({
    has: page.getByText(currentReply, { exact: true }),
  }).first();

  await assistantMessage.hover();
  await assistantMessage.getByRole("button", { name: "Edit" }).click();

  const editComposer = page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "Cancel" }) })
    .filter({ has: page.getByRole("textbox") })
    .last();
  const editComposerInput = editComposer.getByRole("textbox").first();
  await expect(editComposerInput).toBeVisible();
  await editComposerInput.fill(editedPrompt);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Cancel" })
    .locator("xpath=following-sibling::button[normalize-space()='Send'][1]")
    .click();
  await responsePromise;

  await expect(threadMessage(page, editedPrompt)).toBeVisible();
  await expect(page.getByText("2 / 2", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function editUserPrompt(
  page: Page,
  currentPrompt: string,
  editedPrompt: string,
  options?: ReplyOptions,
) {
  const userMessage = page.locator("[data-message-id]").filter({
    has: page.getByText(currentPrompt, { exact: true }),
  }).first();

  await userMessage.hover();
  await userMessage.getByRole("button", { name: "Edit" }).click();

  const editComposer = page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "Cancel" }) })
    .filter({ has: page.getByRole("textbox") })
    .last();
  const editComposerInput = editComposer.getByRole("textbox").first();
  await expect(editComposerInput).toBeVisible();
  await editComposerInput.fill(editedPrompt);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Cancel" })
    .locator("xpath=following-sibling::button[normalize-space()='Send'][1]")
    .click();
  await responsePromise;

  const editedReply = expectedReply(editedPrompt, options);
  await expect(threadMessage(page, editedPrompt)).toBeVisible();
  await expect(threadMessage(page, editedReply)).toBeVisible({
    timeout: 15_000,
  });
}

async function createBranchFromFlow(
  page: Page,
  {
    nodeId,
    actionName,
    prompt,
    options,
  }: {
    nodeId: string;
    actionName: string;
    prompt: string;
    options?: ReplyOptions;
  },
) {
  const fitViewButton = page.locator(".react-flow__controls-fitview");
  if ((await fitViewButton.count()) > 0) {
    await fitViewButton.click();
  }

  const targetNode = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  await expect(targetNode).toBeVisible({ timeout: 15_000 });
  await targetNode.dispatchEvent("click");
  const graphSection = page
    .locator("section")
    .filter({ has: page.getByText("Branch from canvas", { exact: true }) })
    .first();
  await graphSection.getByRole("button", { name: actionName }).click();
  const branchTextarea = graphSection
    .getByRole("textbox")
    .first();
  await expect(branchTextarea).toBeVisible();
  await branchTextarea.fill(prompt);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Create .*branch|Create follow-up/i }).click();
  await responsePromise;

  const reply = expectedReply(prompt, options);
  await expect(threadMessage(page, prompt)).toBeVisible();
  await expect(threadMessage(page, reply)).toBeVisible({ timeout: 15_000 });
  return reply;
}

async function createBranchFromChat(
  page: Page,
  {
    messageText,
    actionName,
    prompt,
    options,
  }: {
    messageText: string;
    actionName: string;
    prompt: string;
    options?: ReplyOptions;
  },
) {
  const message = page.locator("[data-message-id]").filter({
    has: page.getByText(messageText, { exact: true }),
  }).first();

  await message.hover();
  await message.getByRole("button", { name: actionName }).click();

  const branchTextarea = message.getByRole("textbox").last();
  await expect(branchTextarea).toBeVisible();
  await branchTextarea.fill(prompt);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await message.getByRole("button", { name: /Create .*branch|Create follow-up/i }).click();
  await responsePromise;

  const reply = expectedReply(prompt, options);
  await expect(threadMessage(page, prompt)).toBeVisible();
  await expect(threadMessage(page, reply)).toBeVisible({ timeout: 15_000 });
  return reply;
}

type FlowNodeBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

async function getFlowNodeBoxes(page: Page) {
  const mainFlowNodes = page.locator(".react-flow__viewport .react-flow__node");
  await expect(mainFlowNodes.first()).toBeVisible();
  return mainFlowNodes.evaluateAll<FlowNodeBox[]>((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const id = element.getAttribute("data-id");
        if (!id || rect.width === 0 || rect.height === 0) return null;
        return {
          id,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((value): value is FlowNodeBox => value !== null),
  );
}

function getOverlappingNodePairs(boxes: FlowNodeBox[], inset = 12) {
  const pairs: string[] = [];

  for (let index = 0; index < boxes.length; index += 1) {
    const left = boxes[index];
    if (!left) continue;
    const leftBox = {
      x1: left.x + inset,
      y1: left.y + inset,
      x2: left.x + left.width - inset,
      y2: left.y + left.height - inset,
    };

    for (let compareIndex = index + 1; compareIndex < boxes.length; compareIndex += 1) {
      const right = boxes[compareIndex];
      if (!right) continue;
      const rightBox = {
        x1: right.x + inset,
        y1: right.y + inset,
        x2: right.x + right.width - inset,
        y2: right.y + right.height - inset,
      };

      const intersects =
        leftBox.x1 < rightBox.x2 &&
        leftBox.x2 > rightBox.x1 &&
        leftBox.y1 < rightBox.y2 &&
        leftBox.y2 > rightBox.y1;

      if (intersects) {
        pairs.push(`${left.id}<->${right.id}`);
      }
    }
  }

  return pairs;
}

test("loads the workspace without getting stuck on session bootstrap", async ({ page }) => {
  await ensureSignedIn(page);
  await expect(page.getByPlaceholder("Write a message...")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Loading sessions...")).toHaveCount(0);
});

test("sends a prompt and renders the mocked assistant reply", async ({ page }) => {
  await gotoChat(page);
  const reply = await sendPrompt(page, "Browser smoke prompt");
  const assistantMessage = page.locator("[data-message-id]").filter({
    has: page.getByText(reply, { exact: true }),
  }).first();
  await expect(assistantMessage.getByText(/Latency:/)).toBeVisible();
});

test("copies graph JSON after a reply", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Graph smoke prompt");
  const graph = await copyGraphJson(page);

  await expect(graph.nodes).toHaveLength(2);
  await expect(graph.nodes.map((node) => node.role)).toEqual(["user", "assistant"]);
  await expect(graph.connectors).toHaveLength(1);
  await expect(graph.connectors[0]).toMatchObject({
    parentId: graph.nodes[0]?.id ?? null,
    childId: graph.nodes[1]?.id ?? "",
  });
});

test("respects the selected local model in the request metadata", async ({ page }) => {
  await gotoChat(page);

  await page.locator("select").selectOption("ollama:gemma3:4b");
  const reply = await sendPrompt(page, "Model selection prompt", {
    provider: "ollama",
    model: "gemma3:4b",
  });

  const assistantMessage = page.locator("[data-message-id]").filter({
    has: page.getByText(reply, { exact: true }),
  }).first();
  await expect(assistantMessage.getByText("Model: ollama · gemma3:4b", { exact: false })).toBeVisible();
});

test("sends full history when Full mode is selected", async ({ page }) => {
  await gotoChat(page);

  await sendPrompt(page, "First history prompt");
  await page.getByRole("button", { name: "Full" }).click();
  await sendPrompt(page, "Second history prompt", {
    history: "full",
    count: 3,
  });
});

test("creates an assistant branch when reloading a reply", async ({ page }) => {
  await gotoChat(page);

  const prompt = "Reload branch prompt";
  const reply = await sendPrompt(page, prompt);
  const assistantMessage = page.locator("[data-message-id]").filter({
    has: page.getByText(reply, { exact: true }),
  }).first();

  await assistantMessage.hover();
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await assistantMessage.getByRole("button", { name: "Refresh" }).click();
  await responsePromise;

  const graph = await copyGraphJson(page);
  const assistantNodes = graph.nodes.filter((node) => node.role === "assistant");
  const siblingConnectors = graph.connectors.filter((connector) => connector.description === "siblings");

  await expect(assistantNodes).toHaveLength(2);
  await expect(siblingConnectors).toHaveLength(1);
});

test("persists edit branching across reloads", async ({ page }) => {
  await gotoChat(page);

  const originalPrompt = "Original branch prompt";
  const editedPrompt = "Edited branch prompt";
  const initialReply = await sendPrompt(page, originalPrompt);
  await editAssistantReply(page, initialReply, editedPrompt);

  const graphBeforeReload = await copyGraphJson(page);
  const assistantNodesBeforeReload = graphBeforeReload.nodes.filter((node) => node.role === "assistant");
  const connectorKeysBeforeReload = graphBeforeReload.connectors
    .map(
      (connector) =>
        `${connector.description ?? "parent-child"}:${connector.parentId ?? "null"}:${connector.childId}`,
    )
    .sort();
  const nodeIdsBeforeReload = graphBeforeReload.nodes.map((node) => node.id).sort();
  const editedAssistantNodeBeforeReload = graphBeforeReload.nodes.find(
    (node) => node.role === "assistant" && node.parentId === graphBeforeReload.nodes[0]?.id,
  );

  await expect(graphBeforeReload.nodes.length).toBeGreaterThan(2);
  await expect(assistantNodesBeforeReload.length).toBeGreaterThan(1);
  await expect(editedAssistantNodeBeforeReload).toBeDefined();

  const activeSessionId = await getActiveSessionId(page);
  expect(activeSessionId).toBeTruthy();
  if (!activeSessionId) return;

  await expect
    .poll(async () => {
      const persistedSession = await fetchSessionDocument(page, activeSessionId);
      return persistedSession.session.snapshot.messages.filter(
        (entry) => entry.message.role === "assistant",
      ).length;
    })
    .toBe(assistantNodesBeforeReload.length);

  const persistedSession = await fetchSessionDocument(page, activeSessionId);
  const persistedMessages = persistedSession.session.snapshot.messages;
  const persistedMessageIds = persistedMessages.map((entry) => entry.message.id).sort();
  const graphMessageIds = graphBeforeReload.nodes
    .filter((node) => node.id !== "__ROOT__")
    .map((node) => node.id)
    .sort();
  const editedUserMessage = persistedMessages.find(
    (entry) =>
      entry.message.role === "user" &&
      entry.parentId === graphBeforeReload.nodes[0]?.id,
  );

  expect(persistedSession.session.snapshot.headId).toBeTruthy();
  expect(persistedMessageIds).toEqual(graphMessageIds);
  expect(editedUserMessage).toBeDefined();
});

test("creates a new root branch from the flow canvas", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Flow root base prompt");

  await createBranchFromFlow(page, {
    nodeId: "__ROOT__",
    actionName: "New root prompt",
    prompt: "Flow-created root branch",
  });

  const graph = await copyGraphJson(page);
  const rootUserNodes = graph.nodes.filter((node) => node.role === "user" && node.parentId === null);
  expect(rootUserNodes).toHaveLength(2);
});

test("creates a new root branch from the chat thread", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Chat root base prompt");

  await createBranchFromChat(page, {
    messageText: "Chat root base prompt",
    actionName: "New root prompt",
    prompt: "Chat-created root branch",
  });

  const graph = await copyGraphJson(page);
  const rootUserNodes = graph.nodes.filter((node) => node.role === "user" && node.parentId === null);
  expect(rootUserNodes).toHaveLength(2);
});

test("creates a sibling user branch from a flow user node", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Flow user sibling root");
  await sendPrompt(page, "Flow user sibling original");

  const graphBeforeBranch = await copyGraphJson(page);
  const laterUserNodeId = graphBeforeBranch.nodes.find(
    (node) => node.role === "user" && node.parentId !== null,
  )?.id;

  expect(laterUserNodeId).toBeTruthy();
  if (!laterUserNodeId) return;

  await createBranchFromFlow(page, {
    nodeId: laterUserNodeId,
    actionName: "Alternative prompt",
    prompt: "Flow user sibling alternative",
  });

  const graphAfterBranch = await copyGraphJson(page);
  const userSiblingConnectors = graphAfterBranch.connectors.filter((connector) => {
    if (connector.description !== "siblings" || connector.parentId === null) return false;
    const childNode = graphAfterBranch.nodes.find((node) => node.id === connector.childId);
    return childNode?.role === "user";
  });

  expect(userSiblingConnectors.length).toBeGreaterThan(0);
});

test("creates a sibling user branch from a chat user node", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Chat user sibling root");
  await sendPrompt(page, "Chat user sibling original");

  await createBranchFromChat(page, {
    messageText: "Chat user sibling original",
    actionName: "Alternative prompt",
    prompt: "Chat user sibling alternative",
  });

  const graph = await copyGraphJson(page);
  const userSiblingConnectors = graph.connectors.filter((connector) => {
    if (connector.description !== "siblings" || connector.parentId === null) return false;
    const childNode = graph.nodes.find((node) => node.id === connector.childId);
    return childNode?.role === "user";
  });

  expect(userSiblingConnectors.length).toBeGreaterThan(0);
});

test("creates a follow-up user branch from a flow assistant node", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Flow assistant follow-up seed");

  const graphBeforeBranch = await copyGraphJson(page);
  const assistantNodeId = graphBeforeBranch.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await createBranchFromFlow(page, {
    nodeId: assistantNodeId,
    actionName: "Follow-up prompt",
    prompt: "Flow assistant follow-up prompt",
  });

  const graphAfterBranch = await copyGraphJson(page);
  const assistantChildren = graphAfterBranch.nodes.filter(
    (node) => node.role === "user" && node.parentId === assistantNodeId,
  );
  expect(assistantChildren.length).toBeGreaterThan(0);
});

test("creates a follow-up user branch from a chat assistant node", async ({ page }) => {
  await gotoChat(page);
  const assistantReply = await sendPrompt(page, "Chat assistant follow-up seed");

  await createBranchFromChat(page, {
    messageText: assistantReply,
    actionName: "Follow-up prompt",
    prompt: "Chat assistant follow-up prompt",
  });

  const graph = await copyGraphJson(page);
  const assistantNodeId = graph.nodes.find(
    (node) => node.role === "assistant" && node.parentId !== null,
  )?.id;
  const assistantChildren = graph.nodes.filter(
    (node) => node.role === "user" && node.parentId === assistantNodeId,
  );

  expect(assistantNodeId).toBeTruthy();
  expect(assistantChildren.length).toBeGreaterThan(0);
});

test("renders distinct root-user branches without overlap", async ({ page }) => {
  await gotoChat(page);

  const originalPrompt = "Root branch original prompt";
  const editedPrompt = "Root branch edited prompt";
  await sendPrompt(page, originalPrompt);
  await editUserPrompt(page, originalPrompt, editedPrompt);

  await expect(page.locator('.react-flow__node[data-id="__ROOT__"]')).toBeVisible();

  const graph = await copyGraphJson(page);
  const rootUserNodes = graph.nodes.filter((node) => node.role === "user" && node.parentId === null);
  const siblingRootConnectors = graph.connectors.filter(
    (connector) => connector.description === "siblings" && connector.parentId === null,
  );

  expect(rootUserNodes).toHaveLength(2);
  expect(siblingRootConnectors.length).toBeGreaterThan(0);

  const boxes = await getFlowNodeBoxes(page);
  const overlapPairs = getOverlappingNodePairs(boxes);
  expect(overlapPairs).toEqual([]);
});

test("renders distinct later-user branches without overlap", async ({ page }) => {
  await gotoChat(page);

  await sendPrompt(page, "Thread root prompt");
  await sendPrompt(page, "Later user original prompt");
  await editUserPrompt(page, "Later user original prompt", "Later user edited prompt");

  const graph = await copyGraphJson(page);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const assistantIdsWithUserChildren = graph.nodes
    .filter((node) => node.role === "assistant")
    .map((assistantNode) => ({
      assistantId: assistantNode.id,
      userChildren: graph.nodes.filter(
        (candidate) => candidate.role === "user" && candidate.parentId === assistantNode.id,
      ),
    }))
    .filter((entry) => entry.userChildren.length >= 2);

  expect(assistantIdsWithUserChildren).toHaveLength(1);
  expect(assistantIdsWithUserChildren[0]?.userChildren).toHaveLength(2);

  const laterUserSiblingConnectors = graph.connectors.filter((connector) => {
    if (connector.description !== "siblings" || connector.parentId === null) return false;
    const childNode = nodesById.get(connector.childId);
    return childNode?.role === "user";
  });

  expect(laterUserSiblingConnectors.length).toBeGreaterThan(0);

  const overlapPairs = getOverlappingNodePairs(await getFlowNodeBoxes(page));
  expect(overlapPairs).toEqual([]);
});

test("cuts and restores a graph link from the flow renderer", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Flow cut restore prompt");

  const graphBeforeCut = await copyGraphJson(page);
  const assistantNodeId = graphBeforeCut.nodes.find((node) => node.role === "assistant")?.id;
  const parentChildCountBeforeCut = graphBeforeCut.connectors.filter(
    (connector) => connector.description === "parent-child",
  ).length;
  expect(assistantNodeId).toBeTruthy();
  expect(parentChildCountBeforeCut).toBeGreaterThan(0);
  if (!assistantNodeId) return;

  await page.getByRole("button", { name: "Edit Links" }).click();
  await page.locator(`.react-flow__node[data-id="${assistantNodeId}"]`).dispatchEvent("click");
  await page.getByRole("button", { name: "Cut selected link" }).click();
  await expect(page.getByRole("button", { name: /Reset Cuts \(1\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore link" })).toBeVisible();

  const graphAfterCut = await copyGraphJson(page);
  expect(
    graphAfterCut.connectors.filter((connector) => connector.description === "parent-child").length,
  ).toBe(parentChildCountBeforeCut - 1);

  await page.getByRole("button", { name: "Restore link" }).click();
  await expect(page.getByRole("button", { name: /Reset Cuts/ })).toHaveCount(0);

  const graphAfterRestore = await copyGraphJson(page);
  expect(
    graphAfterRestore.connectors.filter((connector) => connector.description === "parent-child").length,
  ).toBe(parentChildCountBeforeCut);
});

test("deletes a session durably across reload", async ({ page }) => {
  test.setTimeout(60_000);

  await gotoChat(page);
  await sendPrompt(page, "Delete persistence prompt");

  const beforeDelete = await listSessionIds(page);
  const activeSessionId = await getActiveSessionId(page);
  expect(activeSessionId).toBeTruthy();
  if (!activeSessionId) return;
  expect(beforeDelete).toContain(activeSessionId);

  await page
    .locator('[data-active="true"]')
    .filter({ has: page.getByRole("button", { name: "Delete session" }) })
    .first()
    .getByRole("button", { name: "Delete session" })
    .click();

  await expect
    .poll(async () => {
      const sessionIds = await listSessionIds(page);
      return sessionIds.includes(activeSessionId);
    })
    .toBe(false);

  const verificationResponse = await page.request.get("/api/sessions");
  expect(verificationResponse.ok()).toBeTruthy();
  const verificationData = (await verificationResponse.json()) as {
    sessions: Array<{ id: string }>;
  };
  expect(verificationData.sessions.map((session) => session.id)).not.toContain(activeSessionId);

  await page.close();
});

test("creates a project from multiple saved sessions and opens the aggregated canvas", async ({ page }) => {
  const firstSessionId = await createAndOpenNamedSession(page, "Project session one");
  await sendPrompt(page, "Project session one");

  const secondSessionId = await createAndOpenNamedSession(page, "Project session two");
  await sendPrompt(page, "Project session two");
  const projectId = await createProjectFromSessions(
    page,
    [firstSessionId, secondSessionId],
    "2 Session Project",
  );
  await openProjectById(page, projectId);

  await expect(page.getByRole("button", { name: "Back to sessions" })).toBeVisible();
  await expect(
    page.getByText("Projects aggregate multiple saved sessions into one persistent canvas."),
  ).toBeVisible();
  await expect(
    page.getByText("Unified canvas for 2 sessions and one shared project context node."),
  ).toBeVisible();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "Context node reusable across branches." }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Arena" }).last().click();
  await expect(page.getByRole("heading", { name: "Project Arena" })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "Arena Synthesis" }).first()).toBeVisible();

  await page.getByLabel("Typed node title").fill("Arena memo");
  await page.getByRole("button", { name: "Pick winner" }).click();
  await page.getByRole("button", { name: "Save arena synthesis" }).click();
  await expect(page.getByText("Typed node saved from Arena synthesis.")).toBeVisible();
  await page.getByRole("button", { name: "Branches" }).click();
  await expect(page.getByText("Arena comparison across 2 selected branches.")).toBeVisible();
  await expect(page.getByText("Compare 2 branches side by side and promote a lead direction into global context.")).toBeVisible();
  await page.getByRole("button", { name: "Create merge node" }).click();
  await expect(page.getByText(/merge node$/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Canvas" }).last().click();
  await expect(page.getByText("Arena memo", { exact: true }).first()).toBeVisible();
  await page.locator('.react-flow__node [data-memory-type="merge"]').first().click();
  await expect(page.getByRole("button", { name: "Use as global context" })).toBeVisible();
  await page.getByRole("button", { name: "Use as global context" }).click();
  await expect(page.getByPlaceholder(/Describe the cross-session goal/i)).toHaveValue(
    /Project Arena branch synthesis/i,
  );
});

test("creates a typed node from canvas focus inside a project", async ({ page }) => {
  const firstSessionId = await createAndOpenNamedSession(page, "Typed node session one");
  await sendPrompt(page, "Typed node session one");

  const secondSessionId = await createAndOpenNamedSession(page, "Typed node session two");
  await sendPrompt(page, "Typed node session two");
  const projectId = await createProjectFromSessions(
    page,
    [firstSessionId, secondSessionId],
    "Typed node project",
  );
  await openProjectById(page, projectId);

  await expect(page.getByText("Unified canvas for 2 sessions and one shared project context node.")).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Typed node session one" }).first().click();

  await page.getByLabel("Typed node type").selectOption("decision");
  await page.getByRole("button", { name: "Use canvas focus" }).click();
  await page.getByRole("button", { name: "Create typed node", exact: true }).click();

  await expect(page.getByText("Decision node created and attached.")).toBeVisible();
  await expect(page.locator('.react-flow__node [data-memory-type="decision"]').first()).toBeVisible();
  await page.locator('.react-flow__node [data-memory-type="decision"]').first().click();
  await expect(page.getByRole("button", { name: "Append to global context" })).toBeVisible();
});

test("deletes a project durably across reload", async ({ page }) => {
  test.setTimeout(60_000);
  const firstSessionId = await createAndOpenNamedSession(page, "Project delete one");
  await sendPrompt(page, "Project delete one");
  const secondSessionId = await createAndOpenNamedSession(page, "Project delete two");
  await sendPrompt(page, "Project delete two");
  const projectId = await createProjectFromSessions(
    page,
    [firstSessionId, secondSessionId],
    "Project delete set",
  );
  await openProjectById(page, projectId);

  const beforeDelete = await listProjectIds(page);
  const activeProjectId = projectId || await getActiveProjectId(page);
  expect(activeProjectId).toBeTruthy();
  if (!activeProjectId) return;
  expect(beforeDelete).toContain(activeProjectId);

  await fetchAppJson(page, "/api/projects", {
    method: "DELETE",
    body: JSON.stringify({ projectIds: [activeProjectId] }),
  }).catch((error) => {
    if (error instanceof Error && error.message.endsWith(": 404")) {
      return null;
    }
    throw error;
  });

  const afterDelete = await listProjectIds(page);
  expect(afterDelete).not.toContain(activeProjectId);
  const verificationResponse = await page.request.get("/api/projects");
  expect(verificationResponse.ok()).toBeTruthy();
  const verificationData = (await verificationResponse.json()) as {
    projects: Array<{ id: string }>;
  };
  expect(verificationData.projects.map((project) => project.id)).not.toContain(activeProjectId);
});

test("shows a visible fallback message when the provider request fails", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 503,
      body: "LLM backend unavailable",
      contentType: "text/plain",
    });
  });

  await gotoChat(page);
  const composer = page.getByPlaceholder("Write a message...");
  await composer.fill("Provider failure prompt");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(threadMessage(page, "Provider failure prompt")).toBeVisible();
  await expect(
    page.getByRole("alert").getByText(
      "Assistant request failed. Check the selected model or provider and try again.",
      { exact: true },
    ),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(composer).toBeVisible();
});

test("creates a text artifact, attaches it as context, and branches with it from the flow", async ({ page }) => {
  test.setTimeout(60_000);
  await gotoChat(page);
  await sendPrompt(page, "Artifact context seed");

  const graphBefore = await copyGraphJson(page);
  const assistantNodeId = graphBefore.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await page.getByRole("button", { name: "New Text" }).click();
  await page.getByLabel("Title").fill("Spec Note");
  await page.getByLabel("Content").fill("Use the attached artifact as additional product context.");

  await page.getByRole("button", { name: `Attach target ${assistantNodeId}` }).click();
  await expect(page.getByRole("button", { name: `Detach target ${assistantNodeId}` })).toBeVisible();
  await page.getByRole("button", { name: `Open target ${assistantNodeId}` }).click();

  const graphSection = page
    .locator("section")
    .filter({ has: page.getByText("Branch from canvas", { exact: true }) })
    .first();
  await graphSection.getByRole("button", { name: "Follow-up prompt" }).click();
  await graphSection.getByRole("textbox").fill("Follow-up with artifact context");

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create follow-up with context" }).click();
  await responsePromise;

  const reply = expectedReply("Follow-up with artifact context", {
    contextCount: 1,
    contextTitles: ["Spec Note"],
  });
  await expect(threadMessage(page, reply)).toBeVisible({ timeout: 15_000 });

  const graphAfter = await copyGraphJson(page);
  expect(graphAfter.artifacts?.some((artifact) => artifact.title === "Spec Note")).toBe(true);
  expect(
    graphAfter.contextLinks?.some(
      (link) => link.targetMessageId === assistantNodeId,
    ),
  ).toBe(true);

  const activeSessionId = await getActiveSessionId(page);
  expect(activeSessionId).toBeTruthy();
  if (!activeSessionId) return;

  const persistedSession = await fetchPersistedSession(page, activeSessionId);
  expect(persistedSession.session.artifacts.some((artifact) => artifact.title === "Spec Note")).toBe(true);
  expect(
    persistedSession.session.contextLinks.some((link) => link.targetMessageId === assistantNodeId),
  ).toBe(true);
  expect(
    persistedSession.session.snapshot.messages.some((entry) =>
      JSON.stringify(entry.message).includes(reply),
    ),
  ).toBe(true);
});

test("uploads an image artifact, persists it, and branches with it from the flow", async ({ page }) => {
  test.setTimeout(60_000);
  await gotoChat(page);
  await sendPrompt(page, "Image artifact seed");

  const graphBefore = await copyGraphJson(page);
  const assistantNodeId = graphBefore.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({
      name: "diagram.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });

  await expect(page.getByLabel("Title")).toHaveValue("diagram");
  await page.getByLabel("Notes").fill("Important branching reference image.");
  await expect(page.getByText("Image preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Attach target ${assistantNodeId}` }).click();
  await page.getByRole("button", { name: `Open target ${assistantNodeId}` }).click();

  const graphSection = page
    .locator("section")
    .filter({ has: page.getByText("Branch from canvas", { exact: true }) })
    .first();
  await graphSection.getByRole("button", { name: "Follow-up prompt" }).click();
  await graphSection.getByRole("textbox").fill("Use the image artifact too");

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/chat") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create follow-up with context" }).click();
  await responsePromise;

  const reply = expectedReply("Use the image artifact too", {
    contextCount: 1,
    contextTitles: ["diagram"],
  });
  await expect(threadMessage(page, reply)).toBeVisible({ timeout: 15_000 });

  const graphAfter = await copyGraphJson(page);
  expect(
    graphAfter.artifacts?.some(
      (artifact) => artifact.title === "diagram" && artifact.type === "image",
    ),
  ).toBe(true);

  const activeSessionId = await getActiveSessionId(page);
  expect(activeSessionId).toBeTruthy();
  if (!activeSessionId) return;

  const persistedSession = await fetchPersistedSession(page, activeSessionId);
  expect(
    persistedSession.session.artifacts?.some(
      (artifact) => artifact.title === "diagram" && artifact.artifactType === "image",
    ),
  ).toBe(true);
  expect(
    persistedSession.session.snapshot.messages.some((entry) =>
      JSON.stringify(entry.message).includes(reply),
    ),
  ).toBe(true);
});

test("opens the canvas guide and explains the selected focus", async ({ page }) => {
  await gotoChat(page);
  await sendPrompt(page, "Canvas guide seed");

  const graph = await copyGraphJson(page);
  const assistantNodeId = graph.nodes.find((node) => node.role === "assistant")?.id;
  expect(assistantNodeId).toBeTruthy();
  if (!assistantNodeId) return;

  await page.getByRole("button", { name: "Guide Agent" }).click();
  await page.locator(`.react-flow__node[data-id="${assistantNodeId}"]`).dispatchEvent("click");
  const guidePanel = page.locator('aside[aria-label="Canvas guide panel"]');
  await guidePanel.getByRole("button", { name: "Explain focus" }).dispatchEvent("click");

  await expect(
    guidePanel.getByText(/Canvas guide: Explain focus on assistant/i),
  ).toBeVisible({ timeout: 15_000 });
});
