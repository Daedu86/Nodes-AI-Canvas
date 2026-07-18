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

The runner is intentionally separate from the Vercel deployment. `codex app-server` is a local process-oriented runtime and its supported default transport is stdio. A desktop/local companion or separately hosted runner can own the Codex process lifecycle while Nodes remains the visual workspace.

## Nodes endpoints

### Start a run

`POST /api/agents/codex/runs`

```json
{
  "sessionId": "session-id",
  "prompt": "Implement the authentication flow and run the tests",
  "workspaceId": "my-repo",
  "role": "coder",
  "label": "Auth implementation",
  "parentRunId": null
}
```

`parentRunId` is the primitive for multi-agent trees. A child agent run sets it to the run id of the parent agent.

### Stream run events

`GET /api/agents/codex/runs/:runId/events`

The endpoint proxies an SSE stream from the Codex Runner. Runner events should use the normalized `CodexCanvasEvent` shape from `lib/agents/codex/types.ts` so the Canvas does not depend directly on Codex app-server protocol details.

### Cancel a run

`POST /api/agents/codex/runs/:runId/cancel`

## Runner configuration

The Next.js server expects:

```text
CODEX_RUNNER_URL=http://127.0.0.1:47821
CODEX_RUNNER_TOKEN=<shared-service-secret>
```

`CODEX_RUNNER_TOKEN` is optional in code for local development, but a remotely reachable runner should require it.

Every Nodes-to-runner request also includes `x-nodes-owner-id`. The runner must scope run lookup, event streaming, and cancellation to that owner id rather than trusting a run id alone.

## Runner HTTP contract

The first runner implementation should expose:

```text
POST /v1/runs
GET  /v1/runs/:runId/events
POST /v1/runs/:runId/cancel
```

A successful start response:

```json
{
  "runId": "run-123",
  "threadId": "codex-thread-123",
  "agentId": "agent-123",
  "parentRunId": null,
  "status": "queued"
}
```

The runner owns these responsibilities:

1. Start and supervise `codex app-server`.
2. Perform the app-server initialize handshake.
3. Start or resume Codex threads.
4. Start turns for user objectives.
5. Convert JSON-RPC notifications into normalized Nodes events.
6. Relay approvals between Nodes and Codex.
7. Track parent/child agent relationships.
8. Enforce workspace allowlists. `workspaceId` must map to a runner-owned path; Nodes should not pass arbitrary filesystem paths.
9. Enforce owner isolation for runs and event streams.

## Event model

The current normalized event vocabulary includes:

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

The event mapper in `lib/agents/codex/event-mapper.ts` provides a compatibility layer for raw app-server notifications. The runner can use the same vocabulary even when Codex protocol details evolve.

## Canvas integration sequence

The recommended UI implementation order is:

1. Add an `Agent` execution mode beside normal LLM mode.
2. Start a Codex run from a prompt or dedicated Agent node.
3. Render one top-level Agent Run node.
4. Append child activity nodes from the SSE stream (shell, tool, file change, approval, final result).
5. Render `parentRunId` edges for spawned subagents.
6. Persist selected run summaries/results into existing Nodes artifacts and project memory.

This keeps OpenRouter chat untouched while adding Codex as one agent engine that Nodes can visualize and orchestrate.
