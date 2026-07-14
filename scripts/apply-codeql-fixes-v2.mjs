import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source for ${label}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one source match for ${label}`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

async function updateLlmSettings() {
  const path = "components/context/llm-settings.tsx";
  let source = await read(path);
  source = replaceOnce(
    source,
    [
      "const createProviderApiKeyId = (prefix: string) => {",
      "  if (typeof crypto !== \"undefined\" && typeof crypto.randomUUID === \"function\") {",
      "    return crypto.randomUUID();",
      "  }",
      "  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;",
      "};",
    ].join("\n"),
    [
      "const createProviderApiKeyId = (prefix: string) => {",
      "  const cryptoApi = globalThis.crypto;",
      "  if (!cryptoApi || typeof cryptoApi.getRandomValues !== \"function\") {",
      "    throw new Error(\"Secure random number generation is unavailable.\");",
      "  }",
      "  if (typeof cryptoApi.randomUUID === \"function\") {",
      "    return cryptoApi.randomUUID();",
      "  }",
      "  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));",
      "  const randomId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, \"0\")).join(",
      "    \"\",",
      "  );",
      "  return `${prefix}-${randomId}`;",
      "};",
    ].join("\n"),
    "secure provider API key identifiers",
  );
  await write(path, source);
}

async function updateSessionArtifacts() {
  const path = "lib/session-artifacts.ts";
  let source = await read(path);
  source = replaceOnce(
    source,
    String.raw`  const escape = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();`,
    String.raw`  const escape = (value: unknown) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\s+/g, " ")
      .trim();`,
    "complete Markdown table escaping",
  );
  await write(path, source);
}

async function updateRotateSecrets() {
  const path = "scripts/rotate-secrets.mjs";
  let source = await read(path);

  source = replaceOnce(
    source,
    "const shouldRun = (name) => !only || only.has(name);\n\nfunction readEnvFile(raw) {",
    [
      "const shouldRun = (name) => !only || only.has(name);",
      "",
      "class RotationError extends Error {",
      "  constructor(code, message) {",
      "    super(message);",
      "    this.name = \"RotationError\";",
      "    this.code = code;",
      "  }",
      "}",
      "",
      "class CommandError extends RotationError {",
      "  constructor(command, status, sensitiveVariableConflict) {",
      "    super(\"COMMAND_FAILED\", `${command} failed with exit code ${status ?? \"unknown\"}`);",
      "    this.sensitiveVariableConflict = sensitiveVariableConflict;",
      "  }",
      "}",
      "",
      "function getRuntimeEnvValue(name) {",
      "  return process.env[name]?.trim() ?? \"\";",
      "}",
      "",
      "function ensureRuntimeEnvValue(name, message) {",
      "  const value = getRuntimeEnvValue(name);",
      "  if (!value) {",
      "    throw new RotationError(\"MISSING_CONFIGURATION\", message);",
      "  }",
      "  return value;",
      "}",
      "",
      "function readEnvFile(raw) {",
    ].join("\n"),
    "rotation error types and runtime environment access",
  );

  source = replaceOnce(
    source,
    [
      "function getEnvValue(state, name) {",
      "  return state.values.get(name)?.trim() ?? \"\";",
      "}",
      "",
    ].join("\n"),
    "",
    "file-backed environment getter",
  );
  source = replaceOnce(
    source,
    [
      "function ensureEnvValue(state, name, message) {",
      "  const value = getEnvValue(state, name);",
      "  if (!value) {",
      "    throw new Error(message);",
      "  }",
      "  return value;",
      "}",
      "",
    ].join("\n"),
    "",
    "file-backed required environment getter",
  );
  source = replaceOnce(
    source,
    [
      "function summarizeStdErr(text) {",
      "  if (!text) {",
      "    return \"no stderr/stdout available\";",
      "  }",
      "  return text",
      "    .split(/\\r?\\n/)",
      "    .map((line) => line.trim())",
      "    .filter(Boolean)",
      "    .slice(-4)",
      "    .join(\" | \");",
      "}",
      "",
    ].join("\n"),
    "",
    "raw command output summarizer",
  );
  source = replaceOnce(
    source,
    [
      "function formatCommandForError(command, commandArgs) {",
      "  const redactedArgs = [];",
      "  for (let index = 0; index < commandArgs.length; index += 1) {",
      "    const arg = commandArgs[index];",
      "    redactedArgs.push(arg);",
      "    if (arg === \"--value\" && index + 1 < commandArgs.length) {",
      "      redactedArgs.push(\"<redacted>\");",
      "      index += 1;",
      "    }",
      "  }",
      "  return `${command} ${redactedArgs.join(\" \")}`;",
      "}",
      "",
    ].join("\n"),
    "",
    "command argument diagnostic formatter",
  );

  source = replaceOnce(
    source,
    [
      "function runCommand(command, commandArgs) {",
      "  const printableCommand = formatCommandForError(command, commandArgs);",
      "  const childEnv = { ...process.env };",
      "  if (command === \"vercel\") {",
      "    delete childEnv.VERCEL_TOKEN;",
      "  }",
      "  const result = spawnSync(command, commandArgs, {",
      "    cwd: process.cwd(),",
      "    env: childEnv,",
      "    encoding: \"utf8\",",
      "    shell: process.platform === \"win32\",",
      "    stdio: \"pipe\",",
      "  });",
      "",
      "  if (result.error) {",
      "    throw new Error(`${printableCommand} failed: ${result.error.message}`);",
      "  }",
      "",
      "  if (result.status !== 0) {",
      "    throw new Error(`${printableCommand} failed: ${summarizeStdErr(result.stderr || result.stdout)}`);",
      "  }",
      "",
      "  return result.stdout.trim();",
      "}",
    ].join("\n"),
    [
      "function runCommand(command, commandArgs) {",
      "  const childEnv = { ...process.env };",
      "  if (command === \"vercel\") {",
      "    delete childEnv.VERCEL_TOKEN;",
      "  }",
      "  const result = spawnSync(command, commandArgs, {",
      "    cwd: process.cwd(),",
      "    env: childEnv,",
      "    encoding: \"utf8\",",
      "    shell: process.platform === \"win32\",",
      "    stdio: \"pipe\",",
      "  });",
      "",
      "  if (result.error) {",
      "    throw new RotationError(\"COMMAND_START_FAILED\", `${command} failed to start`);",
      "  }",
      "",
      "  if (result.status !== 0) {",
      "    const output = result.stderr || result.stdout || \"\";",
      "    const sensitiveVariableConflict =",
      "      command === \"vercel\" && output.includes(\"Sensitive Environment Variable\");",
      "    throw new CommandError(command, result.status, sensitiveVariableConflict);",
      "  }",
      "}",
    ].join("\n"),
    "safe command failure handling",
  );

  source = replaceOnce(
    source,
    [
      "  } catch (error) {",
      "    const message = error instanceof Error ? error.message : String(error);",
      "    if (!message.includes(\"Sensitive Environment Variable\")) {",
      "      throw error;",
      "    }",
    ].join("\n"),
    [
      "  } catch (error) {",
      "    if (!(error instanceof CommandError) || !error.sensitiveVariableConflict) {",
      "      throw error;",
      "    }",
    ].join("\n"),
    "Vercel sensitive-variable fallback",
  );

  source = replaceOnce(
    source,
    "    throw new Error(`${label} failed with HTTP ${response.status}`);",
    "    throw new RotationError(\"HTTP_REQUEST_FAILED\", `${label} failed with HTTP ${response.status}`);",
    "HTTP request failure",
  );
  source = replaceOnce(
    source,
    "      throw new Error(\"OpenRouter key creation returned an incomplete payload\");",
    "      throw new RotationError(\"INCOMPLETE_PROVIDER_RESPONSE\", \"OpenRouter key creation returned an incomplete payload\");",
    "OpenRouter response validation",
  );
  source = replaceOnce(
    source,
    "      throw new Error(\"Supabase API key creation returned an incomplete payload\");",
    "      throw new RotationError(\"INCOMPLETE_PROVIDER_RESPONSE\", \"Supabase API key creation returned an incomplete payload\");",
    "Supabase response validation",
  );

  source = replaceOnce(
    source,
    "  const managementKey = getEnvValue(state, \"OPENROUTER_MANAGEMENT_API_KEY\");",
    "  const managementKey = getRuntimeEnvValue(\"OPENROUTER_MANAGEMENT_API_KEY\");",
    "OpenRouter management key source",
  );
  source = replaceOnce(
    source,
    "    getEnvValue(state, \"OPENROUTER_ROTATION_LIMIT_USD\") || `${defaultOpenRouterRotationLimitUsd}`,",
    "    getRuntimeEnvValue(\"OPENROUTER_ROTATION_LIMIT_USD\") || `${defaultOpenRouterRotationLimitUsd}`,",
    "OpenRouter rotation limit source",
  );
  source = replaceOnce(
    source,
    "  let newHash = getEnvValue(state, \"OPENROUTER_API_KEY_HASH\") || \"<dry-run-hash>\";",
    "  let newHash = getRuntimeEnvValue(\"OPENROUTER_API_KEY_HASH\") || \"<dry-run-hash>\";",
    "OpenRouter key hash source",
  );
  source = replaceOnce(
    source,
    "  const previousHash = getEnvValue(state, \"OPENROUTER_API_KEY_HASH\");",
    "  const previousHash = getRuntimeEnvValue(\"OPENROUTER_API_KEY_HASH\");",
    "OpenRouter previous hash source",
  );

  source = replaceOnce(
    source,
    [
      "function getSupabaseProjectRef(state) {",
      "  const url = ensureEnvValue(state, \"SUPABASE_URL\", \"SUPABASE_URL is required for Supabase rotation\");",
      "  const match = url.match(/^https:\\/\\/([^.]+)\\.supabase\\.co/i);",
      "  if (!match) {",
      "    throw new Error(\"SUPABASE_URL does not look like a hosted Supabase project URL\");",
      "  }",
      "  return match[1];",
      "}",
    ].join("\n"),
    [
      "function getSupabaseProjectRef() {",
      "  const url = ensureRuntimeEnvValue(",
      "    \"SUPABASE_URL\",",
      "    \"SUPABASE_URL is required for Supabase rotation\",",
      "  );",
      "  const match = url.match(/^https:\\/\\/([^.]+)\\.supabase\\.co/i);",
      "  if (!match) {",
      "    throw new RotationError(",
      "      \"INVALID_SUPABASE_URL\",",
      "      \"SUPABASE_URL does not look like a hosted Supabase project URL\",",
      "    );",
      "  }",
      "  return match[1];",
      "}",
    ].join("\n"),
    "Supabase project reference source",
  );
  source = replaceOnce(
    source,
    "  const accessToken = getEnvValue(state, \"SUPABASE_ACCESS_TOKEN\");",
    "  const accessToken = getRuntimeEnvValue(\"SUPABASE_ACCESS_TOKEN\");",
    "Supabase access token source",
  );
  source = replaceOnce(
    source,
    [
      "  const projectRef = getSupabaseProjectRef(state);",
      "  const currentKey = ensureEnvValue(",
      "    state,",
      "    \"SUPABASE_SERVICE_ROLE_KEY\",",
      "    \"SUPABASE_SERVICE_ROLE_KEY is required for Supabase rotation\",",
      "  );",
    ].join("\n"),
    [
      "  const projectRef = getSupabaseProjectRef();",
      "  const currentKey = ensureRuntimeEnvValue(",
      "    \"SUPABASE_SERVICE_ROLE_KEY\",",
      "    \"SUPABASE_SERVICE_ROLE_KEY is required for Supabase rotation\",",
      "  );",
    ].join("\n"),
    "Supabase current secret source",
  );

  source = replaceOnce(
    source,
    "async function syncGoogleSecret(state, summary, warnings) {",
    "async function syncGoogleSecret(summary, warnings) {",
    "Google sync signature",
  );
  source = replaceOnce(
    source,
    "  const googleSecret = getEnvValue(state, \"AUTH_GOOGLE_SECRET\");",
    "  const googleSecret = getRuntimeEnvValue(\"AUTH_GOOGLE_SECRET\");",
    "Google secret source",
  );
  source = replaceOnce(
    source,
    "  await syncGoogleSecret(state, summary, warnings);",
    "  await syncGoogleSecret(summary, warnings);",
    "Google sync call",
  );

  source = replaceOnce(
    source,
    "    await writeFile(envFilePath, `${state.lines.join(\"\\n\").replace(/\\n+$/u, \"\")}\\n`, \"utf8\");",
    [
      "    // codeql[js/http-to-file-access] This trusted CLI persists newly issued keys from fixed provider APIs to the fixed local .env.local file.",
      "    await writeFile(envFilePath, `${state.lines.join(\"\\n\").replace(/\\n+$/u, \"\")}\\n`, \"utf8\");",
    ].join("\n"),
    "intentional provider response persistence",
  );

  source = replaceOnce(
    source,
    [
      "main().catch((error) => {",
      "  const message = error instanceof Error ? error.message : String(error);",
      "  console.error(`Rotation failed: ${message}`);",
      "  process.exitCode = 1;",
      "});",
    ].join("\n"),
    [
      "main().catch((error) => {",
      "  const code = error instanceof RotationError ? error.code : \"UNEXPECTED_INTERNAL_ERROR\";",
      "  console.error(`Rotation failed (${code}).`);",
      "  process.exitCode = 1;",
      "});",
    ].join("\n"),
    "non-sensitive top-level error logging",
  );

  await write(path, source);
}

await updateLlmSettings();
await updateSessionArtifacts();
await updateRotateSecrets();
