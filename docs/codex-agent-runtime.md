# Codex agent runtime integration

Nodes keeps normal LLM chat and Canvas prompt execution on the existing Vercel AI SDK/OpenRouter path. Codex is added as a separate agent runtime for autonomous work.

## Architecture

```text
Browser / Nodes UI
       |
       | authenticated HTTP + SSE
       v
Next.js Codex agent API
       |
       | service-token authenticated HTTP
       v
Nodes Codex Runner
       |
       | JSON-RPC over stdio
       v
codex app-server
       |
       v
Codex core / tools / shell / filesystem / MCP
```

The runner is intentionally separate from the Vercel deployment. `codex app-server` is a long-lived process-oriented runtime and its supported default transport is stdio. For local Nodes development, the runner can live on the same machine. A hosted Vercel deployment needs a separately reachable runner or secure tunnel/private network; `127.0.0.1` inside Vercel does not refer to the user's computer.

## Implemented Canvas behavior

The 2D Canvas now exposes an **Add agent** action. Each Agent node can:

- choose a Codex role (`coder`, `reviewer`, `researcher`, `tester`, or `custom`);
- start an independent Codex run;
- stream agent message and activity events;
- cancel an active run;
- surface command/file approval requests with approve/decline controls;
- create a child Agent node linked visually to its parent run.

Multiple Agent nodes can run independently. `parentRunId` records the Nodes-level parent/subagent relationship. The current child-node implementation starts a separate Codex thread; it does not yet use Codex's internal spawned-subagent thread mechanism.

Agent nodes are currently session-local UI state. Persisting full run graphs across reloads is a follow-up step.

## Nodes endpoints

### Start a run

`POST /api/agents/codex/runs`

```json
{
  "sessionId": "session-id",
  "prompt": "Implement the authentication flow and run the tests",
  "cwd": "/absolute/path/on-the-runner",
  "role": "coder",
  "label": "Auth implementation",
  "parentRunId": null
}
```

The runner normally uses `CODEX_DEFAULT_CWD`; `cwd` is available for trusted configurations where Nodes is allowed to select a runner workspace.

### Stream run events

`GET /api/agents/codex/runs/:runId/events`

The endpoint proxies an SSE stream from the Codex Runner. The runner sends app-server notification envelopes and `lib/agents/codex/event-mapper.ts` converts them into the stable `CodexCanvasEvent` vocabulary used by the Canvas.

### Resolve an approval

`POST /api/agents/codex/runs/:runId/approvals/:approvalId`

```json
{
  "decision": "accept"
}
```

Supported decisions are `accept`, `acceptForSession`, `decline`, and `cancel`.

### Cancel a run

`POST /api/agents/codex/runs/:runId/cancel`

## Runner configuration

The Next.js server expects:

```text
CODEX_RUNNER_URL=http://127.0.0.1:8787
CODEX_RUNNER_TOKEN=<shared-service-secret>
```

The runner itself is implemented in `services/codex-runner/server.mjs` and starts:

```text
codex app-server --listen stdio://
```

The runner inherits the host machine's Codex authentication state. Sign in with Codex CLI on that machine before starting agent runs.

`CODEX_RUNNER_TOKEN` is optional in code for loopback-only development, but a remotely reachable runner should always require it and be protected by a private network or secure tunnel.

Every Nodes-to-runner request includes `x-nodes-owner-id`. Run lookup, event streaming, cancellation, and approvals are scoped to that owner id.

## Runner HTTP contract

The implemented runner exposes:

```text
GET  /healthz
POST /v1/runs
GET  /v1/runs/:runId/events
POST /v1/runs/:runId/cancel
POST /v1/runs/:runId/approvals/:approvalId
```

A successful start response:

```json
{
  "runId": "run-123",
  "threadId": "codex-thread-123",
  "agentId": "agent-123",
  "parentRunId": null,
  "status": "running"
}
```

The runner currently owns these responsibilities:

1. Start and supervise `codex app-server`.
2. Perform the app-server `initialize` / `initialized` handshake.
3. Start Codex threads and turns.
4. Route app-server notifications to the matching Nodes run.
5. Keep an in-memory event backlog and fan it out over SSE.
6. Relay command/file approvals between the Canvas and Codex.
7. Track Nodes-level parent/child run relationships.
8. Scope runs and event streams by Nodes owner id.
9. Interrupt active turns when the user cancels a run.

Production hardening should add a runner-owned workspace allowlist. A public deployment should not allow arbitrary filesystem paths supplied by untrusted clients.

## Event model

The normalized event vocabulary includes:

```text
agent.started
agent.message.delta
agent.message.completed
agent.child.spawned
tool.started
tool.completed
shell.started
shell.completed
file.changed
approval.requested
approval.resolved
run.completed
run.failed
run.cancelled
```

The compatibility mapper keeps the Canvas isolated from most Codex app-server protocol changes.

## Current limitations / next steps

- Persist Agent runs and their event history so nodes survive reloads.
- Map Codex-internal spawned subagent threads into first-class child Agent nodes.
- Render shell, tool, and file-change events as optional child activity nodes instead of only summarizing them inside the Agent node.
- Add workspace allowlists and a secure remote-runner registration flow.
- Attach selected Codex results/diffs to existing Nodes artifacts and reusable project memory.

This keeps OpenRouter chat untouched while adding Codex as an agent engine that Nodes can visualize and orchestrate.
