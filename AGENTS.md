# Repository Agent Manual

This file defines the default operating rules for AI coding agents working in this repository. User instructions given for a specific task take precedence.

## Scope

- Treat this repository as production software.
- Make the smallest complete change that resolves the requested problem.
- Preserve existing behavior unless the task explicitly requires a behavior change.
- Do not introduce speculative refactors, dependencies, workflows, or abstractions.

## Branch and delivery policy

- Work directly on `main` unless the user explicitly requests a branch or pull request.
- Do not create temporary branches.
- Keep commits focused and descriptive.
- Do not rewrite history or force-push.
- Do not leave temporary files, diagnostic workflows, generated reports, or debugging code in the repository after completing a task.

## Before editing

- Read the relevant implementation, tests, configuration, and nearby documentation.
- Confirm the current behavior before changing it.
- Distinguish between a product defect, an obsolete test, a CI configuration problem, and an environment problem.
- Do not remove a test merely to obtain a green result. Remove or replace it only when it verifies behavior that has intentionally been removed or superseded.

## Validation order

Run the cheapest and most targeted checks first. Stop and fix failures before starting expensive validation.

1. Format and lint checks for the affected files.
2. TypeScript checks for the affected scope.
3. Targeted unit tests.
4. Relevant coverage checks.
5. Production build and bundle budget when application code or build configuration changed.
6. Relevant end-to-end tests.
7. Full end-to-end, performance, audit, and security validation only when justified by the scope or required for release hardening.

Do not repeatedly run the entire validation suite while known fast checks are failing.

## CI design principles

- Fast checks should fail immediately rather than use `continue-on-error` unnecessarily.
- Expensive independent jobs should run in parallel after fast checks pass.
- End-to-end tests should be sharded when the suite is large enough to benefit.
- Use path filters only when they cannot hide relevant regressions.
- Keep routine push validation separate from exhaustive nightly, manual, or release validation.
- Store reports as GitHub Actions summaries or artifacts. Do not commit transient CI reports back to `main`.
- Avoid duplicate execution of the same check for the same commit across workflows.

## Security

- Never commit credentials, tokens, private keys, environment files, or sensitive logs.
- Validate and constrain external input before file, network, shell, database, or HTML operations.
- Do not suppress a security finding without documenting why the data flow is safe.
- Exclude generated files from security analysis through explicit configuration rather than modifying generated output.
- Preserve least-privilege permissions in GitHub Actions.

## Canvas and interface behavior

- The Canvas Workspace is a primary product surface, not a decorative secondary view.
- Preserve the real interactive area when changing layout dimensions; visual expansion alone is insufficient.
- Keep the block library compact unless the requested design explicitly changes it.
- Verify keyboard access, accessible names, focus behavior, drag interactions, viewport controls, and node persistence after relevant UI changes.
- Update tests when intentional interface changes make previous selectors or interaction assumptions obsolete.

## Issue completion criteria

An issue may be closed only when:

- the requested behavior is implemented;
- relevant tests and checks pass;
- security findings introduced or exposed by the change are resolved or explicitly justified;
- temporary diagnostics and workflows are removed;
- the repository is left in a clean, maintainable state;
- the closing comment accurately summarizes what changed and what was validated.

If a check cannot be completed because of missing secrets, unavailable infrastructure, permissions, or an external service, state that limitation explicitly. Do not report the issue as fully validated.

## Documentation placement

- Keep stable agent behavior and repository policies in this file.
- Keep detailed CI implementation, workflow topology, shard counts, schedules, and troubleshooting procedures in `docs/ci.md` or the workflow files themselves.
- Update this manual only when the repository-wide operating policy changes.
