<p align="center">
  <img alt="Nodes" src="docs/brand/nodes-logo.svg" width="72" />
</p>

<h1 align="center">Nodes</h1>

<p align="center">
  A branching chat and a visual canvas for thinking with AI.
</p>

Nodes is a workspace for exploration, not just a single-answer chatbot. You can branch conversations, compare directions, and keep reusable context visible while you iterate.

## Product Tour

### Chat + branching

![Chat and branching](docs/readme/01-chat-branching.svg)

Branch from any message (edit or follow-up) and keep parallel paths side by side.

### Canvas + artifacts

![Canvas and artifacts](docs/readme/02-canvas-artifacts.svg)

Artifacts (text, code, images, files) are structured context you can pin and reuse across branches and projects.

### Knowledge Center (built-in wiki)

![Knowledge Center wiki](docs/readme/03-knowledge-center.svg)

A wiki-style workspace for onboarding, patterns, and “how-to” docs that ship with the product.

### LLM Models (per-user connections)

![LLM models and keys](docs/readme/04-llm-models.svg)

Users can connect their own provider credentials and control which models show up in the selector.

## What You Can Do

- Create sessions and branch from user or assistant messages.
- Keep a canvas open while you chat (nodes, artifacts, pinned context).
- Group sessions into projects and keep a shared project context.
- Compare branches or sessions (Arena) and promote winners into memory.
- Read the Knowledge Center docs inside the workspace.
- Use hosted models (OpenRouter) or local models (Ollama) from the same UI.

## Getting Started (As A User)

1. Create a **session** from the sidebar.
2. Pick a model from the top selector.
3. Chat as usual, then use **Edit** or **Follow-up** to create branches.
4. Open **Canvas** to keep key nodes and artifacts visible while you iterate.
5. Add artifacts (text/code/image/file) when context matters more than another message.
6. Open **Profile → LLM Models** to connect your own API keys and control what models appear.

## How People Use Nodes

Nodes works best when you are exploring and deciding:

- Product and UX iteration: branch prompts, compare outcomes, merge the best direction.
- Technical design: keep evidence, snippets, and decisions attached to the same canvas.
- Research: pin sources, draft summaries, and carry context forward across sessions.

## Key Ideas (Quick)

- **Session**: a working conversation you can reopen later.
- **Branch**: a parallel path created from any message (edit or follow-up).
- **Artifact**: structured context (text/code/image/file) you can pin and reuse.
- **Project**: a larger workspace grouping sessions with shared context.
- **Arena**: compare options and promote winners into memory.

## Developer Setup

If you're running this repo locally or deploying it, see:

- [Development guide](docs/development.md)
- [Deploying guide](docs/deploying.md)

## License

This project is licensed under the MIT License.

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream notices related to `assistant-ui`.
