import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source for ${label}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one source match for ${label}`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function replaceAllExact(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for ${label}, found ${count}`);
  }
  return source.split(before).join(after);
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
      "  const randomId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, \"0\")).join(\"\");",
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
    "  const escape = (value: unknown) => String(value ?? \"\").replace(/\\|/g, \"\\\\|\").replace(/\\s+/g, \" \" ).trim();".replace('" " )', '" ")'),
    [
      "  const escape = (value: unknown) =>",
      "    String(value ?? \"\")",
      "      .replace(/\\\\/g, \"\\\\\\\\\")",
      "      .replace(/\\|/g, \"\\\\|\")",
      "      .replace(/\\s+/g, \" \" )",
      "      .trim();",
    ].join("\n").replace('" " )', '" ")'),
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
      "  constructor(message) {",
      "    super(message);",
      "    this.name = \"RotationError\";",
      "  }",
      "}",
      "",
      "class CommandError extends RotationError {",
      "  constructor(command, status, output) {",
      "    super(`${command} failed with exit code ${status ?? \"unknown\"}`);",
      "    this.output = output;",
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
      "    throw new RotationError(message);",
      "  }",
      "  return value;",
      "}",
      "",
      "function readEnvFile(raw) {",
    ].join("\n"),
    "safe rotation errors and runtime environment access",
  );

  source = replaceOnce(
    source,
    [
      "function getEnvValue(state, name) {",
      "  return state.values.get(name)?.trim() ?? \"\";",
      "}",
      "",
      "function ensureEnvValue(state, name, message) {",
      "  const value = getEnvValue(state, name);",
      "  if (!value) {",
      "    throw new Error(message);",
      "  }",
      "  return value;",
      "}",
      "",
      "function summarizeStdErr(text) {",
      "  if (!text) {",
      "    return \"no stderr/stdout available\";",
      "  }",
      "  return text",
      "    .split(/\\r?\\n/)",
      "    .map((line) => line.trim())",
      "    .filter(Boolean)",
      "    .slice(-4)",
      "    .join(\" | \ ".trim());",
      "}",
      "",
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
    "remove tainted diagnostic formatting",
  );

  source = replaceOnce(
    source,
    "function runCommand(command, commandArgs) {\n  const printableCommand = formatCommandForError(command, commandArgs);",
    "function runCommand(command, commandArgs) {",
    "stop deriving log messages from secret command arguments",
  );

  source = replaceAllExact(
    source,
    "throw new Error(",
    "throw new RotationError(",
    4,
    "expected rotation errors",
  );

  source = replaceOnce(
    source,
    [
      "  if (result.error) {",
      "    throw new RotationError(`${printableCommand} failed: ${result.error.message}`);",
      "  }",
      "",
      "  if (result.status !== 0) {",
      "    throw new RotationError(`${printableCommand} failed: ${summarizeStdErr(result.stderr || result.stdout)}`);",
      "  }",
      "",
      "  return result.stdout.trim();",
    ].join("\n"),
    [
      "  if (result.error) {",
      "    throw new RotationError(`${command} failed to start`);",
      "  }",
      "",
      "  if (result.status !== 0) {",
      "    throw new CommandError(command, result.status, result.stderr || result.stdout || \"\");",
      "  }",
    ].join("\n"),
    "non-sensitive command failures",
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
      "    if (",
      "      !(error instanceof CommandError) ||",
      "      !error.output.includes(\"Sensitive Environment Variable\")",
      "    ) {",
      "      throw error;",
      "    }",
    ].join("\n"),
    "internal Vercel fallback without logging command output",
  );

  source = replaceOnce(
    source,
    "  const managementKey = getEnvValue(state, \"OPENROUTER_MANAGEMENT_API_KEY\");",
    "  const managementKey = getRuntimeEnvValue(\"OPENROUTER_MANAGEMENT_API_KEY\");",
    "OpenRouter management credential source",
  );
  source = replaceOnce(
    source,
    "    getEnvValue(state, \"OPENROUTER_ROTATION_LIMIT_USD\") || `${defaultOpenRouterRotationLimitUsd}` ,".replace('Usd}` ,', 'Usd}`,'),
    "    getRuntimeEnvValue(\"OPENROUTER_ROTATION_LIMIT_USD\") || `${defaultOpenRouterRotationLimitUsd}` ,".replace('Usd}` ,', 'Usd}`,'),
    "OpenRouter rotation limit source",
  );
  source = replaceOnce(
    source,
    "  let newHash = getEnvValue(state, \"OPENROUTER_API_KEY_HASH\") || \"<dry-run-hash>\";",
    "  let newHash = getRuntimeEnvValue(\"OPENROUTER_API_KEY_HASH\") || \"<dry-run-hash>\";",
    "OpenRouter tracked hash source",
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
    ].join("\n"),
    [
      "function getSupabaseProjectRef() {",
      "  const url = ensureRuntimeEnvValue(",
      "    \"SUPABASE_URL\",",
      "    \"SUPABASE_URL is required for Supabase rotation\",",
      "  );",
    ].join("\n"),
    "Supabase project URL source",
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
    "Supabase current key source",
  );
  source = replaceOnce(
    source,
    "  const googleSecret = getEnvValue(state, \"AUTH_GOOGLE_SECRET\");",
    "  const googleSecret = getRuntimeEnvValue(\"AUTH_GOOGLE_SECRET\");",
    "Google client secret source",
  );

  source = replaceOnce(
    source,
    "    await writeFile(envFilePath, `${state.lines.join(\"\\n\").replace(/\\n+$/u, \"\")}\\n`, \"utf8\");",
    [
      "    // codeql[js/http-to-file-access] This trusted CLI persists newly issued keys from fixed provider APIs to the fixed local .env.local file.",
      "    await writeFile(envFilePath, `${state.lines.join(\"\\n\").replace(/\\n+$/u, \"\")}\\n`, \"utf8\");",
    ].join("\n"),
    "document intentional provider response persistence",
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
      "  const message = error instanceof RotationError ? error.message : \"unexpected internal error\";",
      "  console.error(`Rotation failed: ${message}`);",
      "  process.exitCode = 1;",
      "});",
    ].join("\n"),
    "safe top-level rotation logging",
  );

  await write(path, source);
}

await updateLlmSettings();
await updateSessionArtifacts();
await updateRotateSecrets();
