# CodeQL remediation verification

- npm ci: success
- node --check scripts/rotate-secrets.mjs: success
- npm run lint: failure
- npm run typecheck: success
- npm run test:unit: success

## npm-ci

```text

added 787 packages, and audited 788 packages in 20s

271 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

```

## syntax

```text

```

## lint

```text

> nodes@0.1.0 lint
> eslint . --max-warnings=0


/home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/scripts/apply-codeql-fixes.mjs
  141:32  error  Parsing error: ',' expected

✖ 1 problem (1 error, 0 warnings)


```

## typecheck

```text

> nodes@0.1.0 typecheck
> tsc --noEmit


```

## tests

```text
 [32m✓[39m tests/artifact-upload-governor.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/session-orchestration.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m tests/account-plan-route.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m tests/llm-settings.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 241[2mms[22m[39m
[90mstderr[2m | tests/title-route.test.ts[2m > [22m[2m/api/title[2m > [22m[2mreturns a generic title error instead of raw upstream details
[22m[39m/api/title error: Error: provider trace here
    at [90m/home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mtests/title-route.test.ts:76:44
    at [90mfile:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:302:11
    at [90mfile:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:1903:26
    at [90mfile:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:2326:20
    at new Promise (<anonymous>)
    at runWithCancel [90m(file:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:2323:10[90m)[39m
    at [90mfile:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:2305:20
    at new Promise (<anonymous>)
    at runWithTimeout [90m(file:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:2272:10[90m)[39m
    at [90mfile:///home/runner/work/Nodes-AI-Canvas/Nodes-AI-Canvas/[39mnode_modules/[4m@vitest/runner[24m/dist/chunk-artifact.js:2955:64

 [32m✓[39m tests/title-route.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 46[2mms[22m[39m
 [32m✓[39m tests/session-schema-evolution.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m tests/thread-list.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 482[2mms[22m[39m
     [33m[2m✓[22m[39m suppresses accidental new-session clicks immediately after leaving manage mode [33m 481[2mms[22m[39m
 [32m✓[39m tests/api-access.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m tests/thread-branching-runtime.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/block-library.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 464[2mms[22m[39m
 [32m✓[39m tests/session-persistence.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m tests/session-blob-maintenance-route.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/artifact-upload-request.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m tests/memory-store.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m tests/app-header.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 329[2mms[22m[39m
     [33m[2m✓[22m[39m uses the main Split control as a reversible toggle [33m 327[2mms[22m[39m
 [32m✓[39m tests/browser-security.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/thread-branching.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/agent-work-workspace.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 318[2mms[22m[39m
     [33m[2m✓[22m[39m deletes a saved token from the dashboard activity view [33m 316[2mms[22m[39m
 [32m✓[39m tests/session-conflict-handling.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
[90mstderr[2m | tests/theme-toggle.test.tsx[2m > [22m[2mThemeToggle[2m > [22m[2mhydrates without recovering when a persisted light theme exists
[22m[39mThe current testing environment is not configured to support act(...)
The current testing environment is not configured to support act(...)

[90mstderr[2m | tests/theme-toggle.test.tsx[2m > [22m[2mThemeToggle[2m > [22m[2mhydrates without recovering when a persisted light theme exists
[22m[39mThe current testing environment is not configured to support act(...)

 [32m✓[39m tests/theme-toggle.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 297[2mms[22m[39m
 [32m✓[39m tests/artifact-presentation.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/workspace-split-layout.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 223[2mms[22m[39m
 [32m✓[39m tests/project-invitation-token.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/chat-stream-metrics.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/canvas-run-scheduler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/session-blob-store.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m tests/canvas-flow-indexes.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/agent-access-workspace.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 383[2mms[22m[39m
     [33m[2m✓[22m[39m creates a token with an explicit expiry and confirms it was saved [33m 380[2mms[22m[39m
 [32m✓[39m tests/canvas-inspector-view-model.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/root-page.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m tests/e2e-auth.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/persisted-resource-client.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/canvas-branch-submission.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/graph-models.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/serial-task-queue.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m tests/canvas-session-state.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/auth-screen.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m tests/openrouter-deployment-key-policy.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/canvas-graph-view-model.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/canvas-prompt-artifact.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/proxy.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m tests/llm-settings-store.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/session-lifecycle.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/project-workspace-utils.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/workspace-onboarding.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/canvas-viewport-controller.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m tests/post-auth-handoff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m tests/ollama-provider-policy.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m
 [32m✓[39m tests/app-title-sync.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 13[2mms[22m[39m

[2m Test Files [22m [1m[32m90 passed[39m[22m[90m (90)[39m
[2m      Tests [22m [1m[32m323 passed[39m[22m[90m (323)[39m
[2m   Start at [22m 09:42:10
[2m   Duration [22m 16.34s[2m (transform 2.92s, setup 0ms, import 12.40s, tests 7.37s, environment 16.20s)[22m


```

