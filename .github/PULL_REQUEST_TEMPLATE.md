## Summary

Describe the change and the user, product, or operational problem it solves.

## Product impact

- Product area:
- User-visible behavior:
- Before:
- After:

## Evidence

Include focused screenshots, recordings, logs, benchmark output, or test results when relevant. Remove credentials and private content.

## Validation

- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] Relevant unit or route tests
- [ ] `npm run test:critical-coverage` when a critical module changed
- [ ] Relevant Playwright flow when user behavior changed
- [ ] `npm run benchmark:canvas:budget` when Canvas graph construction changed
- [ ] `npm run build` when configuration, routing, or production behavior changed

## Risk review

- [ ] Authentication and authorization remain enforced server-side.
- [ ] Secrets, provider keys, tokens, and private project data are not logged or committed.
- [ ] File and Supabase backends remain compatible, or the difference is documented.
- [ ] Failure and recovery behavior is explicit.
- [ ] Documentation and `.env.example` were updated when configuration changed.

## Scope

List intentionally excluded follow-up work so reviewers can distinguish omissions from regressions.
