**Assistant‑UI Starter**

A Next.js + React starter that showcases a modern ChatGPT‑style UX using `@assistant-ui/react`, the AI SDK, and a local LLM via Ollama. It includes message editing and branching, rich Markdown rendering, a thread list with titles, a visual thread tree, and a “history mode” toggle that controls how much context is sent to the model.

— Built to be a practical base for your own assistant UX.

**What It Does**
- Chat UI built from Assistant‑UI primitives (thread, messages, composer, actions).
- Runs locally by default using Ollama (`gemma3:4b`) for fast iteration.
- Sends either full conversation or only the last user message based on a toggle.
- Renders Markdown with code blocks and copy buttons.
- Provides thread titles (auto‑generated or manually renamed) and a sidebar list.
- Visualizes conversation branches with a thread tree dialog.

**Key Files**
- `app/api/chat/route.ts`: Edge route that streams responses from Ollama and supports tool calls.
- `app/api/title/route.ts`: Generates a short thread title using Ollama.
- `components/assistant-ui/thread.tsx`: Main chat surface (composer, messages, actions, branching).
- `components/assistant-ui/thread-graph.tsx`: Interactive visual tree of message branches.
- `components/assistant-ui/thread-title.tsx`: Auto‑/manual thread titles with localStorage persistence.
- `components/assistant-ui/markdown-text.tsx`: Markdown rendering with code copy.

**What’s New (Recent Additions)**
- History mode toggle (Last vs Full) with persistence and runtime wiring.
- Thread Tree viewer to explore message branches and jump to nodes.
- Local title generation via Ollama with sanitize/shorten logic.
- Manual title rename with instant local persistence and UI update.
- Tool call fallback renderer to inspect tool name, args, and result.
- Action bars for edit/copy/reload on assistant/user messages.

**Roadmap (Next 3–4 Items)**
- Model selector (switch between local models and OpenAI/other providers).
- File uploads and image display in messages with safe previews.
- Thread persistence (cloud or local DB) and restore across sessions.
- Basic tool examples (e.g., weather, docs search) with typed args.

**Getting Started**

Prerequisites
- Node.js 18+ and a package manager (`npm`, `pnpm`, or `yarn`).
- Ollama installed and running locally: https://ollama.com
- Pull a model (default is `gemma3:4b`): `ollama pull gemma3:4b`

Environment
- Copy `.env.example` to `.env.local` and adjust as needed:
  - `OLLAMA_API_URL=http://localhost:11434/api` (default Ollama API)
  - `OPENAI_API_KEY=...` (only if you later add an OpenAI model)

Run Dev Server
```bash
npm run dev
# or: pnpm dev / yarn dev / bun dev
```
Visit `http://localhost:3000`.

**Usage Tips**
- Toggle “History: Last/Full” under the composer to control context sent to the model.
- Click the tree button to open the thread graph and navigate branches.
- Hover messages for action bars (edit/copy/refresh); cancel generation from the composer.
- Rename a thread title from the header; clear it to fall back to auto‑generated.

**Tech Stack**
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, `ai`
- `ollama-ai-provider` (local LLMs via Ollama)
