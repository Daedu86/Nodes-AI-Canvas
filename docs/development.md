# Development

This repo is a Next.js (React) app.

## Requirements

- Node.js 20+ (recommended)
- npm
- One model provider:
  - OpenRouter for hosted models
  - Ollama for local models

## Install

```bash
npm ci
```

## Configure `.env.local`

Start from the template:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

Then pick one:

### OpenRouter (hosted)

```env
OPENROUTER_API_KEY=your-key
OPENROUTER_API_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=http://localhost:3000
OPENROUTER_TITLE=Nodes
DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_MODEL=nvidia/nemotron-3-super-120b-a12b:free
NEXT_PUBLIC_DEFAULT_PROVIDER=openrouter
```

### Ollama (local)

```env
OLLAMA_API_URL=http://localhost:11434/api
DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_MODEL=gemma3:4b
NEXT_PUBLIC_DEFAULT_PROVIDER=ollama
```

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Tests

```bash
npm test
npm run test:e2e
```

