# Development

This repository is a Next.js and React application.

## Requirements

- Node.js 22
- npm
- One model provider:
  - OpenRouter for hosted models
  - Ollama for local models

The repository pins the Node major in `.nvmrc`, `package.json`, and CI. With nvm:

```bash
nvm install
nvm use
```

Verify the active runtime before installing dependencies:

```bash
node --version
```

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

## Quality commands

```bash
npm run format
npm run format:check
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
```

`format` applies the autofixes supplied by the repository's ESLint configuration. `format:check` is the non-mutating form used by CI.

`npm run check` runs formatting/lint validation, TypeScript, and unit coverage. `npm run test:ci` adds the Playwright suite with one worker.

Coverage uses V8 and enforces the thresholds in `vitest.config.ts`. The run writes:

- `coverage/index.html` for local inspection.
- `coverage/coverage-summary.json` for tooling.
- a text summary in the terminal.

The production build is intentionally left to Vercel so GitHub Actions does not duplicate build minutes.
