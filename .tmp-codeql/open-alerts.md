# Open CodeQL alerts

## #7: File data in outbound network request

- Rule: `js/file-access-to-http`
- Severity: `medium`
- File: `scripts/rotate-secrets.mjs:149-149`
- State: `open`

```text
   139 |       "--force",
   140 |       "--sensitive",
   141 |       "--value",
   142 |       value,
   143 |       "--yes",
   144 |     ]);
   145 |   }
   146 | }
   147 | 
   148 | async function fetchJson(url, init, label) {
>  149 |   const response = await fetch(url, init);
   150 |   if (!response.ok) {
   151 |     throw new Error(`${label} failed with HTTP ${response.status}`);
   152 |   }
   153 |   return response.json();
   154 | }
   155 | 
   156 | async function rotateAuthSecret(state, summary) {
   157 |   if (!shouldRun("auth")) return;
   158 | 
   159 |   const nextSecret = randomBytes(32).toString("base64url");
```

## #6: Network data written to file

- Rule: `js/http-to-file-access`
- Severity: `medium`
- File: `scripts/rotate-secrets.mjs:379-379`
- State: `open`

```text
   369 |   const state = readEnvFile(rawEnv);
   370 |   const summary = [];
   371 |   const warnings = [];
   372 | 
   373 |   await rotateAuthSecret(state, summary);
   374 |   await rotateOpenRouterKey(state, summary, warnings);
   375 |   await rotateSupabaseSecretKey(state, summary, warnings);
   376 |   await syncGoogleSecret(state, summary, warnings);
   377 | 
   378 |   if (!dryRun) {
>  379 |     await writeFile(envFilePath, `${state.lines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
   380 |   }
   381 | 
   382 |   await deployProduction(summary);
   383 | 
   384 |   console.log("Rotation summary:");
   385 |   for (const line of summary) {
   386 |     console.log(`- ${line}`);
   387 |   }
   388 | 
   389 |   if (warnings.length > 0) {
```

## #5: Clear-text logging of sensitive information

- Rule: `js/clear-text-logging`
- Severity: `high`
- File: `scripts/rotate-secrets.mjs:399-399`
- State: `open`

```text
   389 |   if (warnings.length > 0) {
   390 |     console.log("Warnings:");
   391 |     for (const line of warnings) {
   392 |       console.log(`- ${line}`);
   393 |     }
   394 |   }
   395 | }
   396 | 
   397 | main().catch((error) => {
   398 |   const message = error instanceof Error ? error.message : String(error);
>  399 |   console.error(`Rotation failed: ${message}`);
   400 |   process.exitCode = 1;
   401 | });
   402 | 
```

## #4: Insecure randomness

- Rule: `js/insecure-randomness`
- Severity: `high`
- File: `components/context/llm-settings.tsx:556-556`
- State: `open`

```text
   546 |       const currentKeys = current.providers.ollama.apiKeys ?? [];
   547 |       const next = [
   548 |         ...currentKeys,
   549 |         {
   550 |           createdAt: new Date().toISOString(),
   551 |           id: createProviderApiKeyId("ollama-key"),
   552 |           key: trimmedKey,
   553 |           name: trimmedName || `Ollama key ${currentKeys.length + 1}`,
   554 |         },
   555 |       ];
>  556 |       const activeApiKeyId = current.providers.ollama.activeApiKeyId ?? next[0]?.id ?? null;
   557 |       const activeKey =
   558 |         next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
   559 |       return {
   560 |         providers: {
   561 |           ...current.providers,
   562 |           ollama: {
   563 |             ...current.providers.ollama,
   564 |             activeApiKeyId,
   565 |             apiKey: activeKey,
   566 |             apiKeys: next,
```

## #3: Insecure randomness

- Rule: `js/insecure-randomness`
- Severity: `high`
- File: `components/context/llm-settings.tsx:477-477`
- State: `open`

```text
   467 |       const currentKeys = current.providers.openrouter.apiKeys ?? [];
   468 |       const next = [
   469 |         ...currentKeys,
   470 |         {
   471 |           createdAt: new Date().toISOString(),
   472 |           id: createProviderApiKeyId("or-key"),
   473 |           key: trimmedKey,
   474 |           name: trimmedName || `OpenRouter key ${currentKeys.length + 1}`,
   475 |         },
   476 |       ];
>  477 |       const activeApiKeyId = current.providers.openrouter.activeApiKeyId ?? next[0]?.id ?? null;
   478 |       const activeKey =
   479 |         next.find((entry) => entry.id === activeApiKeyId)?.key ?? next[0]?.key ?? "";
   480 |       return {
   481 |         providers: {
   482 |           ...current.providers,
   483 |           openrouter: {
   484 |             ...current.providers.openrouter,
   485 |             activeApiKeyId,
   486 |             apiKey: activeKey,
   487 |             apiKeys: next,
```

## #2: Insecure randomness

- Rule: `js/insecure-randomness`
- Severity: `high`
- File: `components/context/llm-settings.tsx:430-430`
- State: `open`

```text
   420 |                 },
   421 |               ];
   422 |               nextActiveId = newId;
   423 |             }
   424 |           }
   425 | 
   426 |           return {
   427 |             ...current.providers,
   428 |             [provider]: {
   429 |               ...currentProvider,
>  430 |               activeApiKeyId: nextActiveId,
   431 |               apiKey: value,
   432 |               apiKeys: nextKeys,
   433 |               clearApiKey: false,
   434 |               hasApiKey: trimmed.length > 0 || nextKeys.length > 0,
   435 |             },
   436 |           };
   437 |         })(),
   438 |       }));
   439 |     },
   440 |     [],
```

## #1: Incomplete string escaping or encoding

- Rule: `js/incomplete-sanitization`
- Severity: `high`
- File: `lib/session-artifacts.ts:465-465`
- State: `open`

```text
   455 | 
   456 | const trimArtifactText = (value: string, maxLength = 220) => {
   457 |   const compact = value.replace(/\s+/g, " ").trim();
   458 |   if (!compact) return "No preview available.";
   459 |   return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
   460 | };
   461 | 
   462 | const markdownTableFromRows = (rows: Array<Record<string, unknown>>) => {
   463 |   const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
   464 |   if (columns.length === 0) return null;
>  465 |   const escape = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
   466 |   return [
   467 |     `| ${columns.map(escape).join(" | ")} |`,
   468 |     `| ${columns.map(() => "---").join(" | ")} |`,
   469 |     ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(" | ")} |`),
   470 |   ].join("\n");
   471 | };
   472 | 
   473 | const parseJsonTable = (text: string) => {
   474 |   const candidate = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
   475 |   try {
```

