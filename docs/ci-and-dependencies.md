# Continuous integration and dependency policy

The repository validates every push and pull request targeting `main` through independent GitHub Actions jobs. Parallel jobs keep feedback fast while preserving a complete release gate.

## CI jobs

- **Quality** runs ESLint with zero warnings and the strict TypeScript project check.
- **Unit and coverage** runs the complete Vitest suite with repository-wide baseline coverage and a second, higher threshold for selected critical modules.
- **Production build** runs `next build` with a preview environment so production-only secret validation is not bypassed in deployed environments or incorrectly required from untrusted pull requests.
- **Dependency audit** rejects high or critical vulnerabilities in production dependencies and critical vulnerabilities anywhere in the lockfile.
- **End-to-end** runs Playwright after quality and build succeed and uploads failure traces, screenshots, video, and reports.

The workflow uses least-privilege `contents: read` permissions and cancels superseded runs on the same ref.

## Critical coverage

Repository-wide coverage retains the existing baseline. `vitest.critical.config.ts` additionally enforces stronger thresholds for:

- Environment validation.
- Artifact upload validation.
- Chat streaming timing metrics.
- Canvas link indexing.

The critical thresholds are 70% for statements, lines, and functions, and 60% for branches. They are intentionally isolated so future modules can be added without weakening the existing guardrail.

## Dependency updates

Dependabot checks npm and GitHub Actions every Monday in the `Europe/Berlin` timezone.

- Production minor and patch npm updates are grouped.
- Development minor and patch npm updates are grouped separately.
- Major updates remain individual for deliberate review.
- GitHub Actions updates are proposed separately.

Dependency changes must pass the same CI, build, audit, and E2E gates as application changes.

## Action pinning

Third-party and GitHub-maintained actions are referenced by complete immutable commit SHAs. Human-readable version comments remain beside each SHA. Dependabot can propose newer action revisions without allowing a mutable tag to change an already reviewed workflow silently.

## Code scanning

CodeQL analyzes JavaScript and TypeScript on pushes, pull requests, manual runs, and a weekly schedule. It uses the `security-extended` query suite and grants only the permissions needed to upload security results.

## Local commands

```bash
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:critical-coverage
npm run build
npm run audit:production
npm run audit:all
npm run test:e2e -- --workers=1
```

The Next.js TypeScript project excludes Playwright specifications because they execute in a separate browser runtime. E2E files remain covered by ESLint and are validated by Playwright itself.

## Branch protection

The workflows create stable job names suitable for required status checks:

- `Quality`
- `Unit and coverage`
- `Production build`
- `Dependency audit`
- `End-to-end`
- `Analyze JavaScript and TypeScript`

Repository administrators should select these names in the `main` branch protection or ruleset settings. Workflow definitions cannot independently mark themselves as required checks.

## Release verification

A temporary push-only diagnostic workflow validates the same commands and publishes concise commit statuses while this CI migration is being introduced. It is removed before the phase release so the permanent workflows remain the sole source of future checks.
