# AI Canvas

AI Canvas is a Next.js chat workspace built on top of `@assistant-ui/react`.
It combines a ChatGPT-style conversation surface with message branching, a visual thread graph, per-message model tracking, and support for both local Ollama models and remote OpenRouter models.

The current codebase is no longer just an Ollama starter. The app can run fully against OpenRouter, and the UI includes model selection and graph tooling that go beyond the original template.

## What it does

- Chat UI built with `@assistant-ui/react` and the AI SDK.
- Provider-aware model routing for `ollama` and `openrouter`.
- Model selector in the header for switching between local and hosted models.
- History mode toggle:
  - `Last` sends only the latest user message.
  - `Full` sends the full conversation history.
- Thread list with new-thread and archive actions.
- Auto-generated thread titles plus manual rename support.
- Message edit / reload / copy actions.
- Branch-aware conversation flow with branch picker controls.
- Interactive thread graph:
  - inline graph panel
  - modal graph viewer
  - pan / zoom
  - link cut / restore tools
  - graph JSON export
- Per-message model provenance stored in localStorage so the UI can show which model/provider produced a response.

## Tech stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- `@assistant-ui/react`
- `@assistant-ui/react-ai-sdk`
- `ai`
- `ollama-ai-provider`
- `@ai-sdk/openai` for OpenRouter access

## Local setup

### Prerequisites

- Node.js 18+
- npm
- Optional: Ollama if you want local models
- OpenRouter API key if you want hosted models

### Install

```bash
npm ci
```

### Environment

Create `.env.local` from `.env.example` and configure the provider you want to use.

Relevant variables:

- `OPENROUTER_API_KEY`
  Required for OpenRouter models.
- `OPENROUTER_API_URL`
  Defaults to `https://openrouter.ai/api/v1`.
- `OPENROUTER_REFERER`
  Optional but recommended for OpenRouter attribution and limits.
- `OPENROUTER_TITLE`
  Optional OpenRouter app title metadata.
- `OLLAMA_API_URL`
  Defaults to `http://localhost:11434/api`.
- `ENABLE_OLLAMA_CONTROL_ROUTE`
  Optional. Set to `1` only if you want the advanced local-only `/api/llm/control` route enabled.
- `DEFAULT_MODEL`
  Server-side default used by `/api/chat` and `/api/title`.
- `NEXT_PUBLIC_DEFAULT_MODEL`
  Client-side default model shown when no prior model is saved in localStorage.
- `NEXT_PUBLIC_DEFAULT_PROVIDER`
  Client-side default provider (`ollama` or `openrouter`).

Example OpenRouter-oriented setup:

```env
OPENROUTER_API_KEY=your-key
OPENROUTER_API_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=http://localhost:3000
OPENROUTER_TITLE=ai-canvas
DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_PROVIDER=openrouter
```

Example Ollama-oriented setup:

```env
OLLAMA_API_URL=http://localhost:11434/api
DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_PROVIDER=ollama
```

### Run the app

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## How the app is structured

### App shell

- [app/page.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/app/page.tsx)
  Minimal entrypoint that renders the assistant.
- [app/assistant.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/app/assistant.tsx)
  Main orchestrator. It creates the chat runtime, mounts context providers, persists UI state, and renders the 3-panel layout:
  - sidebar
  - chat thread
  - inline thread graph

### Main UI components

- [components/assistant-ui/thread.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/thread.tsx)
  Main chat surface. Renders user and assistant messages, composer, action bars, branch picker, history mode controls, and message metadata.
- [components/assistant-ui/thread-list.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/thread-list.tsx)
  Sidebar thread list with new-thread and archive actions.
- [components/assistant-ui/thread-title.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/thread-title.tsx)
  Handles auto title generation and manual renaming. Manual titles are stored in localStorage.
- [components/assistant-ui/model-selector.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/model-selector.tsx)
  Header dropdown for switching model/provider combinations.
- [components/assistant-ui/markdown-text.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/markdown-text.tsx)
  Markdown renderer with GFM and copyable code blocks.
- [components/assistant-ui/tool-fallback.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/tool-fallback.tsx)
  Fallback renderer for tool calls and tool results inside assistant messages.

### Thread graph

- [components/assistant-ui/thread-graph-inline.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/thread-graph-inline.tsx)
  Canvas-based graph viewer for all conversation branches. Supports:
  - pan and zoom
  - click-to-jump to a message
  - connector editing
  - cut / restore link overrides
  - JSON export
- [components/assistant-ui/thread-graph.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/thread-graph.tsx)
  Dialog wrapper that reuses the inline graph viewer in a modal.
- [components/assistant-ui/use-thread-repo-items.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/assistant-ui/use-thread-repo-items.ts)
  Extracts and normalizes exported thread data from the runtime. This is the key adapter between the assistant runtime and the graph.

### Context providers

- [components/context/history-mode.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/context/history-mode.tsx)
  Global `Last` vs `Full` history mode.
- [components/context/llm-enabled.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/context/llm-enabled.tsx)
  UI-level enabled/disabled state for LLM usage.
- [components/context/model-config.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/context/model-config.tsx)
  Current active model and provider.
- [components/context/link-editor.tsx](/C:/Users/daedu/Documents/Playground/AI%20Canvas/components/context/link-editor.tsx)
  Persistent graph link overrides used by the thread graph.

### API routes

- [app/api/chat/route.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/app/api/chat/route.ts)
  Main chat endpoint. Resolves `provider` and `model`, then streams the reply using either OpenRouter or Ollama.
- [app/api/title/route.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/app/api/title/route.ts)
  Title generation endpoint. Uses the same provider-aware model resolution pattern.
- [app/api/llm/control/route.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/app/api/llm/control/route.ts)
  Advanced local-only Ollama utility route for pulling, warming, and stopping local models. It is disabled by default and only available when `ENABLE_OLLAMA_CONTROL_ROUTE=1` is set. The main cloud-first UI flow does not depend on it.

### Supporting libraries

- [lib/message-model-registry.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/lib/message-model-registry.ts)
  Persists per-message model/provider metadata in localStorage.
- [lib/assistant-edit-branching.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/lib/assistant-edit-branching.ts)
  Defines metadata keys used when modeling edited assistant branches.

## Runtime behavior

### Model routing

The app can resolve the active model from:

1. explicit request body
2. runtime config
3. environment defaults

If a model name contains `/`, the code treats it as an OpenRouter model unless a provider is explicitly set.

### Persistence

The app stores several UI concerns in localStorage:

- selected model/provider
- history mode
- LLM enabled state
- thread title overrides
- graph node positions
- graph link overrides
- per-message model registry

There is no server-side conversation persistence layer in this repo today.

## Current caveats

- The README used to describe the project as primarily Ollama-based. The code now supports OpenRouter directly and the model selector is part of the current UX.
- The header toggle is now provider-agnostic and only enables or disables outgoing AI requests in the client. It is no longer meant to represent local model lifecycle management.
- Local Ollama models are still selectable, but the dedicated Ollama lifecycle route is now treated as an advanced opt-in path instead of part of the default product surface.
- The thread graph and normalization logic are more advanced than the rest of the docs originally suggested. If you are changing message branching behavior, start with `use-thread-repo-items.ts`.

## Testing

Run the test suite with:

```bash
npm test
```

The current test coverage includes normalization logic for edited / bridged thread structures:

- [tests/thread-normalization.test.ts](/C:/Users/daedu/Documents/Playground/AI%20Canvas/tests/thread-normalization.test.ts)

## Codex Workflow

If you want to work on this repo with parallel Codex subagents, see [AGENTS.md](AGENTS.md).

The repo is organized for agent ownership by bounded areas such as:

- `ui-chat`
- `graph-branching`
- `provider-backend`
- `state-runtime`

## Suggested next documentation updates

- Document the graph JSON export format.
- Document whether the optional Ollama utility route should remain exposed in the main product.
