# Nodes Codex Runner

The Codex Runner is the local execution bridge between Nodes AI Canvas and `codex app-server`.

It intentionally runs outside the Next.js/Vercel process because Codex needs a long-lived local process with access to a workspace, shell, files, Git, and the user's Codex authentication state.

## Architecture

```text
Nodes Canvas (browser)
  -> /api/agents/codex/*
  -> Nodes server
  -> CODEX_RUNNER_URL
  -> services/codex-runner/server.mjs
  -> codex app-server --listen stdio://
  -> Codex harness
```

## Prerequisites

1. Install Codex CLI on the machine that will run the agent.
2. Run `codex` once and sign in with the ChatGPT account that should power Codex.
3. Make sure the target repository/workspace exists on that same machine.

## Start locally

```bash
export CODEX_RUNNER_TOKEN="replace-with-a-long-random-secret"
export CODEX_DEFAULT_CWD="/absolute/path/to/your/workspace"
npm --prefix services/codex-runner start
```

The runner listens on `127.0.0.1:8787` by default.

Configure the Nodes app with the matching values:

```bash
CODEX_RUNNER_URL=http://127.0.0.1:8787
CODEX_RUNNER_TOKEN=replace-with-a-long-random-secret
```

## Environment variables

- `CODEX_RUNNER_HOST`: bind host, default `127.0.0.1`.
- `CODEX_RUNNER_PORT`: bind port, default `8787`.
- `CODEX_RUNNER_TOKEN`: shared bearer secret expected from Nodes.
- `CODEX_BIN`: Codex executable, default `codex`.
- `CODEX_DEFAULT_CWD`: default workspace used by new agent runs.
- `CODEX_RUNNER_AUTO_APPROVE=1`: automatically accepts Codex command/file approval requests. Disabled by default.
- `CODEX_RUNNER_REQUEST_TIMEOUT_MS`: JSON-RPC request timeout, default 30 seconds.
- `CODEX_RUNNER_APPROVAL_TIMEOUT_MS`: time before an unanswered approval is declined, default 5 minutes.

## Security

Keep the runner private. The default host is loopback-only. Do not expose it directly to the public internet.

Command and file approvals are not auto-accepted by default. Approval requests are streamed back to the Codex Agent node in the Canvas, where the user can approve or decline them.

## Multi-agent model

Each Canvas Agent node starts its own Codex thread/turn. A child node sends its parent's `runId` as `parentRunId`, so Nodes can visualize parent/subagent relationships without coupling the Canvas to Codex's internal thread representation.

Codex may also create internal subagent threads. Those notifications remain available in the runner event stream and can be mapped into richer child-node behavior later.
