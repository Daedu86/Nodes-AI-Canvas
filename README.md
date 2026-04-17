# Nodes

![Nodes logo](docs/brand/nodes-logo.svg)

Nodes is a visual workspace for thinking with AI: a chat that can branch, plus a canvas that keeps context visible.

Instead of losing everything in one long thread, Nodes helps you explore multiple directions, compare them, and merge what matters.

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

## Run Locally

### Requirements

- Node.js 20+ (recommended)
- npm
- One model provider:
  - OpenRouter for hosted models
  - Ollama for local models

### Install

```bash
npm ci
```

### Configure env

Start from the template:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

Then pick one:

#### OpenRouter (hosted)

```env
OPENROUTER_API_KEY=your-key
OPENROUTER_API_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=http://localhost:3000
OPENROUTER_TITLE=Nodes
DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_PROVIDER=openrouter
```

#### Ollama (local)

```env
OLLAMA_API_URL=http://localhost:11434/api
DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_PROVIDER=ollama
```

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy (Vercel + Supabase)

This repo is a Next.js app (React) that deploys cleanly to Vercel. The simplest cloud setup is:

- Vercel (app hosting)
- Supabase (Postgres + Storage)

For details, see [docs/cloud-persistence.md](docs/cloud-persistence.md).

### Production envs (minimum)

Use `.env.example` as the full reference. At minimum you will need:

```env
AUTH_SECRET=
NEXTAUTH_URL=https://your-deployed-url.vercel.app
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_ENABLE_DEV_CREDENTIALS=0

ALLOW_REMOTE_API=1
NODES_PERSISTENCE_BACKEND=supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SESSION_ARTIFACTS_BUCKET=session-artifacts
```

### First-time Supabase setup

1. Create a Supabase project.
2. Apply [supabase/schema.sql](supabase/schema.sql).
3. Create (or verify) a private Storage bucket named `session-artifacts`.
4. If you already have local data, run:

```bash
npm run setup:supabase-storage
npm run migrate:supabase
```

### OAuth callback URL (GitHub)

Set your GitHub OAuth callback URL to:

```text
https://your-deployed-url.vercel.app/api/auth/callback/github
```

## Notes For End Users

- You can add your own provider API keys in **Profile → LLM Models**.
- The model selector only shows models that are enabled and usable for your account.
- If you are running a public deployment, prefer requiring user-provided keys for hosted providers.

## License

This project is licensed under the MIT License.

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream notices related to `assistant-ui`.
