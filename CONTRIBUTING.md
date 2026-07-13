# Contributing to Nodes

Thank you for helping improve Nodes. Contributions should keep the product understandable, secure, testable, and maintainable.

## Before You Start

- Search existing issues and pull requests to avoid duplicating work.
- For a substantial feature or architectural change, open an issue first and describe the problem, proposed behavior, and alternatives considered.
- Report vulnerabilities privately by following [SECURITY.md](SECURITY.md), not through a public issue.

## Local Setup

Requirements:

- Node.js 22
- npm
- OpenRouter for hosted models or Ollama for local models

Install and configure the repository:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

See [docs/development.md](docs/development.md) for provider configuration and the complete command reference.

## Development Principles

- Keep changes focused on one problem.
- Preserve server-side authentication and ownership checks.
- Never expose secrets, service-role credentials, or per-user provider keys to browser code.
- Validate untrusted input at API and storage boundaries.
- Prefer shared utilities over duplicating response, validation, and error-handling behavior.
- Update documentation when configuration, behavior, or operational requirements change.
- Add or update tests for user-visible behavior, regressions, security boundaries, and domain rules.

## Quality Checks

Run the checks that match your change:

```bash
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:critical-coverage
npm run build
npm run test:e2e
```

For a broad or high-risk change, run the complete CI-equivalent suite:

```bash
npm run test:ci
```

Canvas performance changes can also be checked with:

```bash
npm run benchmark:canvas
```

## Tests

- Unit tests belong under `tests/`.
- Browser tests belong under `tests/e2e/`.
- Keep tests deterministic and independent from real provider credentials.
- Use the E2E mock LLM and isolated test stores rather than external production services.
- When fixing a bug, add a regression test that fails without the fix whenever practical.

The repository enforces baseline coverage globally and higher thresholds for selected critical modules. Do not lower thresholds to make an unrelated change pass.

## Commit Messages

Use concise imperative or conventional-style commit messages. Existing examples include:

- `feat: add project invitation controls`
- `fix: preserve project context`
- `docs: clarify deployment requirements`
- `test: cover upload rejection paths`
- `ci: improve workflow diagnostics`

Avoid mixing temporary diagnostics, refactors, documentation, and product behavior in one commit unless they are inseparable.

## Pull Requests

A pull request should explain:

- the problem being solved;
- the chosen approach;
- important tradeoffs or security implications;
- tests performed;
- screenshots or recordings for meaningful UI changes;
- required environment, database, or deployment changes.

Keep the diff reviewable. Prefer a series of small, coherent changes over a large unrelated batch.

Before requesting review:

- remove temporary logs and diagnostic workflows;
- verify that no credentials or local absolute paths were committed;
- update `.env.example` for new configuration variables;
- update relevant documentation;
- confirm CI and CodeQL pass.

## Database and Persistence Changes

For Supabase changes:

- keep migrations and schema changes reproducible;
- document migration order and operational impact;
- preserve ownership enforcement and server-only service-role access;
- consider existing local file-backed data and migration compatibility;
- include rollback or recovery guidance for destructive changes.

See [docs/cloud-persistence.md](docs/cloud-persistence.md) and [docs/deploying.md](docs/deploying.md).

## Documentation

Use repository-relative links so documentation works on GitHub and in local clones. Do not commit links containing personal machine paths such as `C:\Users\...` or `/Users/...`.

Configuration documentation should identify:

- whether a variable is required or optional;
- its safe default;
- whether it is local-only or production-safe;
- interactions with related flags;
- whether the value is secret.

## License

By contributing, you agree that your contribution will be licensed under the repository's [MIT License](LICENSE).
