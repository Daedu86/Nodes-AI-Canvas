import { promises as fs } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const clean = args.has("--clean");
const force = args.has("--force");

if (process.env.NODES_PERSISTENCE_BACKEND === "supabase") {
  throw new Error(
    "The product demo seed writes only to the local file backend. Set NODES_PERSISTENCE_BACKEND=file.",
  );
}

const rootDir = process.cwd();
const devEmail = process.env.AUTH_DEV_EMAIL?.trim() || "demo@nodes.local";
const ownerId = process.env.NODES_DEMO_OWNER_ID?.trim() || `dev:${devEmail}`;
const createdAt = "2026-07-13T08:00:00.000Z";
const updatedAt = new Date().toISOString();

const storeDirs = {
  memory: path.resolve(process.env.PROJECT_MEMORY_STORE_DIR || path.join(rootDir, "data", "memory")),
  projects: path.resolve(process.env.PROJECT_STORE_DIR || path.join(rootDir, "data", "projects")),
  sessions: path.resolve(process.env.SESSION_STORE_DIR || path.join(rootDir, "data", "sessions")),
};

const ids = {
  project: "demo-nodes-product-launch",
  memory: {
    decision: "demo-memory-positioning-decision",
    evidence: "demo-memory-research-evidence",
    summary: "demo-memory-launch-summary",
  },
  sessions: {
    launch: "demo-launch-plan",
    onboarding: "demo-onboarding",
    positioning: "demo-positioning",
  },
};

const textContent = (text) => [{ type: "text", text }];

const message = ({ id, role, text, model = null, provider = null, metadata = undefined }) => ({
  id,
  role,
  content: textContent(text),
  createdAt,
  ...(model ? { model } : {}),
  ...(provider ? { provider } : {}),
  ...(metadata ? { metadata } : {}),
});

const artifact = ({ id, title, content, semanticType, x, y }) => ({
  id,
  title,
  artifactType: "text",
  semanticType,
  blobRef: null,
  byteSize: null,
  content,
  fileName: null,
  language: null,
  mimeType: null,
  position: { x, y },
  sourceDataUrl: null,
  promptStatus: null,
  promptResult: null,
  promptError: null,
  promptRunId: null,
  promptModel: null,
  promptProvider: null,
  promptStartedAt: null,
  promptCompletedAt: null,
  syncMode: "auto",
  revisions: [],
  createdAt,
  updatedAt,
});

const link = ({ id, relation, artifactId, promptId = null, responseId = null }) => ({
  id,
  relation,
  artifactId,
  promptId,
  responseId,
  targetMessageId: relation === "context" ? promptId : null,
  createdAt,
});

const sessions = [
  {
    id: ids.sessions.positioning,
    title: "[Demo] Positioning directions",
    archived: false,
    createdAt,
    updatedAt,
    ownerId,
    version: 1,
    snapshot: {
      headId: "positioning-assistant-decision",
      messages: [
        {
          parentId: null,
          message: message({
            id: "positioning-user-root",
            role: "user",
            text: "We are launching an AI workspace for product teams. Generate three positioning directions and explain the trade-offs.",
          }),
        },
        {
          parentId: "positioning-user-root",
          message: message({
            id: "positioning-assistant-options",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Three viable directions: collaboration-first, visual thinking, and decision quality. Collaboration is easy to understand but crowded; visual thinking is differentiated but needs demonstration; decision quality ties the product to measurable outcomes.",
          }),
        },
        {
          parentId: "positioning-assistant-options",
          message: message({
            id: "positioning-user-collaboration",
            role: "user",
            text: "Develop the collaboration-first direction for a product launch page.",
          }),
        },
        {
          parentId: "positioning-user-collaboration",
          message: message({
            id: "positioning-assistant-collaboration",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Headline: Think with AI together. The message is accessible, but it underplays branching, Arena comparison, and persistent project memory.",
          }),
        },
        {
          parentId: "positioning-assistant-options",
          message: message({
            id: "positioning-user-decision",
            role: "user",
            text: "Develop the decision-quality direction and make it concrete.",
            metadata: { custom: { nodesEditSourceId: "positioning-user-collaboration" } },
          }),
        },
        {
          parentId: "positioning-user-decision",
          message: message({
            id: "positioning-assistant-decision",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Headline: Explore every direction. Keep the decision. Nodes turns branching AI conversations into a visual decision workspace where teams compare alternatives, preserve evidence, and promote the strongest outcome into shared memory.",
          }),
        },
      ],
    },
    artifacts: [
      artifact({
        id: "positioning-artifact-evidence",
        title: "Positioning evidence",
        semanticType: "evidence",
        x: 760,
        y: 80,
        content: "Product teams lose alternatives in linear chat, repeat context across sessions, and struggle to explain why one AI-generated direction won.",
      }),
      artifact({
        id: "positioning-artifact-decision",
        title: "Chosen positioning",
        semanticType: "decision",
        x: 760,
        y: 300,
        content: "Explore every direction. Keep the decision. Lead with decision quality; demonstrate branching, Canvas, Arena, and memory as the mechanism.",
      }),
    ],
    contextLinks: [
      link({
        id: "positioning-link-evidence",
        relation: "context",
        artifactId: "positioning-artifact-evidence",
        promptId: "positioning-user-decision",
      }),
      link({
        id: "positioning-link-decision",
        relation: "output",
        artifactId: "positioning-artifact-decision",
        responseId: "positioning-assistant-decision",
      }),
    ],
  },
  {
    id: ids.sessions.onboarding,
    title: "[Demo] Five-minute onboarding",
    archived: false,
    createdAt,
    updatedAt,
    ownerId,
    version: 1,
    snapshot: {
      headId: "onboarding-assistant-final",
      messages: [
        {
          parentId: null,
          message: message({
            id: "onboarding-user-root",
            role: "user",
            text: "Design a five-minute onboarding that makes branching and Canvas immediately understandable.",
          }),
        },
        {
          parentId: "onboarding-user-root",
          message: message({
            id: "onboarding-assistant-first",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Start with a preloaded product decision, ask the user to branch one message, pin one artifact to Canvas, compare two paths in Arena, and promote the winner into project memory.",
          }),
        },
        {
          parentId: "onboarding-assistant-first",
          message: message({
            id: "onboarding-user-followup",
            role: "user",
            text: "Turn that into a guided checklist with a clear success moment.",
          }),
        },
        {
          parentId: "onboarding-user-followup",
          message: message({
            id: "onboarding-assistant-final",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Checklist: open the demo project, branch the positioning prompt, pin a decision, compare the two branches, then promote the winner. Success message: You turned exploration into reusable team context.",
          }),
        },
      ],
    },
    artifacts: [
      artifact({
        id: "onboarding-artifact-plan",
        title: "Onboarding checklist",
        semanticType: "plan",
        x: 720,
        y: 170,
        content: "1. Open the demo project. 2. Branch a message. 3. Pin a decision to Canvas. 4. Compare alternatives in Arena. 5. Promote the winner to memory.",
      }),
    ],
    contextLinks: [
      link({
        id: "onboarding-link-plan",
        relation: "output",
        artifactId: "onboarding-artifact-plan",
        responseId: "onboarding-assistant-final",
      }),
    ],
  },
  {
    id: ids.sessions.launch,
    title: "[Demo] 30-day launch plan",
    archived: false,
    createdAt,
    updatedAt,
    ownerId,
    version: 1,
    snapshot: {
      headId: "launch-assistant-plan",
      messages: [
        {
          parentId: null,
          message: message({
            id: "launch-user-root",
            role: "user",
            text: "Create a 30-day launch plan for Nodes using the chosen positioning and onboarding flow.",
          }),
        },
        {
          parentId: "launch-user-root",
          message: message({
            id: "launch-assistant-plan",
            role: "assistant",
            provider: "openrouter",
            model: "openrouter/free",
            text: "Week 1: sharpen the narrative and record the demo. Week 2: recruit design partners. Week 3: publish use-case content and benchmark proof. Week 4: launch publicly, interview users, and convert feedback into the next roadmap cycle.",
          }),
        },
      ],
    },
    artifacts: [
      artifact({
        id: "launch-artifact-plan",
        title: "30-day launch plan",
        semanticType: "plan",
        x: 690,
        y: 120,
        content: "Week 1 — narrative and demo. Week 2 — design partners. Week 3 — use-case content and proof. Week 4 — public launch and structured feedback.",
      }),
      artifact({
        id: "launch-artifact-question",
        title: "Open launch question",
        semanticType: "question",
        x: 690,
        y: 330,
        content: "Which initial segment shows the strongest pull: product managers, UX researchers, or technical design teams?",
      }),
    ],
    contextLinks: [
      link({
        id: "launch-link-plan",
        relation: "output",
        artifactId: "launch-artifact-plan",
        responseId: "launch-assistant-plan",
      }),
      link({
        id: "launch-link-question",
        relation: "context",
        artifactId: "launch-artifact-question",
        promptId: "launch-user-root",
      }),
    ],
  },
];

const memoryItems = [
  {
    id: ids.memory.decision,
    ownerId,
    title: "Positioning decision",
    type: "decision",
    content: "Lead with decision quality: Explore every direction. Keep the decision.",
    sourceProjectId: ids.project,
    sourceKeys: ["positioning-assistant-decision", "positioning-artifact-decision"],
    sourceKind: "branch",
    sourceSessionId: ids.sessions.positioning,
    createdAt,
    updatedAt,
  },
  {
    id: ids.memory.evidence,
    ownerId,
    title: "User problem evidence",
    type: "evidence",
    content: "Linear chat hides alternatives, loses rationale in scrollback, and makes reusable context difficult to maintain across a team.",
    sourceProjectId: ids.project,
    sourceKeys: ["positioning-artifact-evidence"],
    sourceKind: "session",
    sourceSessionId: ids.sessions.positioning,
    createdAt,
    updatedAt,
  },
  {
    id: ids.memory.summary,
    ownerId,
    title: "Launch strategy summary",
    type: "summary",
    content: "Demonstrate the complete loop: branch, preserve context on Canvas, compare in Arena, and promote the winner into project memory.",
    sourceProjectId: ids.project,
    sourceKeys: ["launch-artifact-plan", "onboarding-artifact-plan"],
    sourceKind: "session",
    sourceSessionId: ids.sessions.launch,
    createdAt,
    updatedAt,
  },
];

const project = {
  id: ids.project,
  ownerId,
  title: "[Demo] Nodes product launch",
  globalContext: [
    "Objective: launch Nodes as an AI decision workspace for product teams.",
    "Audience: product managers, UX researchers, and technical design teams.",
    "Core narrative: branching enables exploration; Canvas preserves structured context; Arena makes comparison explicit; memory carries the decision forward.",
    "Constraint: the public demo should communicate the product loop in under 60 seconds.",
  ].join("\n"),
  sessionIds: [ids.sessions.positioning, ids.sessions.onboarding, ids.sessions.launch],
  memoryIds: [ids.memory.decision, ids.memory.evidence, ids.memory.summary],
  members: [],
  arenaWinnerSessionId: ids.sessions.positioning,
  arenaWinnerBranchKey: null,
  createdAt,
  updatedAt,
};

const targets = [
  ...sessions.map((session) => ({
    path: path.join(storeDirs.sessions, `${session.id}.json`),
    value: session,
  })),
  ...memoryItems.map((item) => ({
    path: path.join(storeDirs.memory, `${item.id}.json`),
    value: item,
  })),
  {
    path: path.join(storeDirs.projects, `${project.id}.json`),
    value: project,
  },
];

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const writeJsonAtomic = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
};

if (clean) {
  await Promise.all(targets.map((target) => fs.rm(target.path, { force: true })));
  console.log(`Removed the Nodes product demo for ${ownerId}.`);
  process.exit(0);
}

const existingTargets = [];
for (const target of targets) {
  if (await exists(target.path)) existingTargets.push(target.path);
}

if (existingTargets.length === targets.length && !force) {
  console.log(`The Nodes product demo is already seeded for ${ownerId}.`);
  process.exit(0);
}

if (existingTargets.length > 0 && !force) {
  throw new Error(
    `A partial demo seed already exists. Re-run with --force to replace only the demo files:\n${existingTargets.join("\n")}`,
  );
}

for (const target of targets) {
  await writeJsonAtomic(target.path, target.value);
}

console.log(
  [
    "Nodes product demo seeded.",
    `Owner: ${ownerId}`,
    `Project: ${project.title}`,
    `Sessions: ${sessions.length}`,
    `Memory items: ${memoryItems.length}`,
    "Start the app, sign in with the configured local development credentials, and open the demo project.",
  ].join("\n"),
);