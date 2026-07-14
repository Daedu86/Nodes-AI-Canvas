# Development

This repository is a Next.js and React application.

## Requirements

- Node.js 22
- npm
- One model provider for live inference:
  - OpenRouter for hosted models
  - Ollama for supported local development configurations

The seeded product demo does not require a live model response.

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

Set a non-placeholder local development password when `AUTH_ENABLE_DEV_CREDENTIALS=1`.

Then pick one provider configuration when you need live inference.

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

### Ollama (local development)

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

## Seeded product demo

Create a deterministic workspace for presentations, screenshots, or product evaluations:

```bash
npm run demo:seed
```

Start the app, sign in with the development credentials from `.env.local`, and open `[Demo] Nodes product launch`.

The demo includes three sessions, branching, Canvas artifacts, a project Arena winner, and promoted memory. It uses the local file backend and does not overwrite non-demo records.

```bash
npm run demo:reset  # replace only the stable demo records
npm run demo:clean  # remove only the stable demo records
```

The default seeded owner is `dev:<AUTH_DEV_EMAIL>`. Override it when the authenticated development user has another ID:

```bash
NODES_DEMO_OWNER_ID="your-user-id" npm run demo:reset
```

See [product-demo.md](product-demo.md) for the 60-second narration and recording sequence.

## Quality commands

```bash
npm run format
npm run format:check
npm run typecheck
npm test
npm run test:coverage
npm run test:critical-coverage
npm run benchmark:canvas:budget
npm run benchmark:canvas
npm run build
npm run bundle:budget
npm run build:budget
npm run test:e2e
npm run test:a11y:e2e
```

`format` applies the autofixes supplied by the repository's ESLint configuration. `format:check` is the non-mutating form used by CI.

`npm run check` runs formatting/lint validation, TypeScript, repository coverage, and critical-module coverage. `npm run test:ci` adds the production build, JavaScript bundle budget, and the standard Playwright suite with one worker for a deterministic local run.

`npm run bundle:budget` inspects the JavaScript chunks from an existing `.next` production build. `npm run build:budget` runs `next build` first and then enforces the gzip limits.

Coverage uses V8 and enforces the thresholds in `vitest.config.ts` and `vitest.critical.config.ts`. The run writes:

- `coverage/index.html` for local inspection.
- `coverage/coverage-summary.json` for tooling.
- `coverage/critical/index.html` for critical-module inspection.
- a text summary in the terminal.

## Accessibility E2E

`npm run test:a11y:e2e` runs the focused Playwright accessibility suite. It checks serious and critical axe findings, dialog focus trapping and restoration, and the `inert` behavior of hidden workspace panels.

The default local browser is Chromium. To run the same suite in Firefox:

```bash
PLAYWRIGHT_BROWSER_NAME=firefox npm run test:a11y:e2e
```

On Windows PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSER_NAME="firefox"
npm run test:a11y:e2e
```

GitHub Actions runs this suite independently in Chromium and Firefox. Browser-specific clipboard permissions are enabled only for Chromium.

## Canvas performance

`npm run benchmark:canvas:budget` builds a quarter-size graph and the standard benchmark graph, then checks both an absolute median duration and the scaling ratio between the two workloads. The default limits are intentionally broad enough for shared CI runners:

- `CANVAS_FLOW_MAX_MEDIAN_MS=10000`
- `CANVAS_FLOW_MAX_SCALE_RATIO=30`

Override either environment variable when calibrating a specific machine. Tighten the committed CI limits only after several stable runs demonstrate a lower sustainable baseline.

`npm run benchmark:canvas` runs the Tinybench suite for 1,000 messages, 300 artifacts/prompts, and 2,000 links. It writes the machine-readable report to `test-results/canvas-benchmark.json`.

GitHub Actions runs linting, type checking, unit and critical coverage, the Canvas performance budget, a production build, the JavaScript bundle budget, dependency audits, standard Playwright E2E across two isolated Chromium shards, and focused accessibility E2E in Chromium and Firefox. Failure artifacts and selected reports are retained for diagnosis. Vercel performs an additional deployment build for previews and production when the project quota permits it.

## Contribution workflow

Before proposing a change, run the checks that match the affected area. For the complete contribution process, commit conventions, and pull request expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md).
