# Nodes product demo

This guide presents the complete Nodes product loop in about 60 seconds without depending on a live model response.

The seeded workspace contains:

- three sessions with realistic product-launch work;
- a branching positioning conversation;
- Canvas artifacts for evidence, decisions, plans, and open questions;
- a project that groups all three sessions;
- promoted project memory;
- an Arena winner that can be discussed during the presentation.

## Run the seeded demo

Use the local file backend and development credentials from `.env.local`:

```env
NODES_PERSISTENCE_BACKEND=file
AUTH_ENABLE_DEV_CREDENTIALS=1
AUTH_DEV_EMAIL=demo@nodes.local
AUTH_DEV_PASSWORD=choose-a-local-password
AUTH_DEV_NAME=Local Developer
```

Then seed and start the workspace:

```bash
npm ci
npm run demo:seed
npm run dev
```

Sign in with the configured development email and password. Open the project named:

```text
[Demo] Nodes product launch
```

The seed command is idempotent. To replace only the demo records or remove them:

```bash
npm run demo:reset
npm run demo:clean
```

The script never deletes non-demo sessions, projects, or memory items. It writes only to the local file backend.

## 60-second presentation script

### 0–10 seconds — The problem

Open **[Demo] Positioning directions**.

> Most AI tools make exploration linear. Once a team tries several directions, the alternatives and the reasoning behind the decision disappear into scrollback.

Point to the conversation tree and the two branches under the initial positioning response.

### 10–25 seconds — Branch instead of restarting

Show the collaboration-first branch and the decision-quality branch.

> Nodes lets you branch from any message. The team can develop competing directions without copying context into separate chats or losing the original path.

Select the decision-quality branch as the stronger direction.

### 25–40 seconds — Preserve structured context on Canvas

Open **Canvas** and highlight:

- **Positioning evidence**;
- **Chosen positioning**;
- the links between prompts, responses, and artifacts.

> Important context becomes a first-class object. Evidence, decisions, plans, drafts, code, images, and files remain visible and reusable instead of being buried in the transcript.

### 40–50 seconds — Compare explicitly in Arena

Open the demo project and switch to **Arena**.

> Arena turns comparison into a product workflow. Teams can review competing branches or sessions side by side and select a winner deliberately.

Show that **Positioning directions** is the selected winning session.

### 50–60 seconds — Carry the decision forward

Open the project memory or Context Builder and point to:

- **Positioning decision**;
- **User problem evidence**;
- **Launch strategy summary**.

> The winner does not stay trapped in one conversation. Nodes promotes it into project memory so later sessions inherit the outcome, the evidence, and the launch context.

Close with:

> Nodes is not another chat interface. It is a visual decision workspace for exploring alternatives, preserving context, and keeping the strongest result.

## Suggested recording sequence

For a short product video or GIF, record at 1440×900 or 1280×800 and use this sequence:

1. Open the positioning session and expand both branches.
2. Select the decision-quality branch.
3. switch to Canvas and pan across the evidence and decision artifacts;
4. open the project and enter Arena;
5. finish in project memory or Context Builder.

Keep the cursor movement deliberate and avoid typing or waiting for a model. The seeded content makes the recording deterministic.

## Demo reset behavior

The demo uses stable IDs so screenshots and scripted presentations stay repeatable. `npm run demo:reset` updates only these records:

- `demo-positioning`;
- `demo-onboarding`;
- `demo-launch-plan`;
- `demo-nodes-product-launch`;
- three `demo-memory-*` items.

Set `NODES_DEMO_OWNER_ID` when the local authenticated user does not use the default development identity:

```bash
NODES_DEMO_OWNER_ID="your-user-id" npm run demo:reset
```
