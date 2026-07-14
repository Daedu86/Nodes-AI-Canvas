import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg
  ? new Set(
      onlyArg
        .slice("--only=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    )
  : null;

const dryRun = args.has("--dry-run");
const deploy = !args.has("--no-deploy");
const envFilePath = path.resolve(process.cwd(), ".env.local");
const vercelEnvironment = "production";
const defaultOpenRouterRotationLimitUsd = 0.01;
const allowedProviderHosts = new Set(["openrouter.ai", "api.supabase.com"]);

const shouldRun = (name) => !only || only.has(name);

class RotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RotationError";
    this.code = code;
  }
}

class CommandError extends RotationError {
  constructor(command, status, sensitiveVariableConflict) {
    super("COMMAND_FAILED", `${command} failed with exit code ${status ?? "unknown"}`);
    this.sensitiveVariableConflict = sensitiveVariableConflict;
  }
}

function getRuntimeEnvValue(name) {
  return process.env[name]?.trim() ?? "";
}

function ensureRuntimeEnvValue(name, message) {
  const value = getRuntimeEnvValue(name);
  if (!value) {
    throw new RotationError("MISSING_CONFIGURATION", message);
  }
  return value;
}

function readEnvFile(raw) {
  const lines = raw.split(/\r?\n/);
  const values = new Map();
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    values.set(line.slice(0, equalsIndex), line.slice(equalsIndex + 1));
  }
  return { lines, values };
}

function setEnvValue(state, name, value) {
  const nextLine = `${name}=${value}`;
  const lineIndex = state.lines.findIndex((line) => line.startsWith(`${name}=`));
  if (lineIndex >= 0) {
    state.lines[lineIndex] = nextLine;
  } else {
    state.lines.push(nextLine);
  }
  state.values.set(name, value);
}

function runCommand(command, commandArgs) {
  const childEnv = { ...process.env };
  if (command === "vercel") {
    delete childEnv.VERCEL_TOKEN;
  }
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "pipe",
  });

  if (result.error) {
    throw new RotationError("COMMAND_START_FAILED", `${command} failed to start`);
  }

  if (result.status !== 0) {
    const output = result.stderr || result.stdout || "";
    const sensitiveVariableConflict =
      command === "vercel" && output.includes("Sensitive Environment Variable");
    throw new CommandError(command, result.status, sensitiveVariableConflict);
  }
}

function setVercelSecret(name, value) {
  if (dryRun) {
    console.log(`[dry-run] would update Vercel ${vercelEnvironment} secret ${name}`);
    return;
  }

  try {
    runCommand("vercel", [
      "env",
      "update",
      name,
      vercelEnvironment,
      "--sensitive",
      "--value",
      value,
      "--yes",
    ]);
  } catch (error) {
    if (!(error instanceof CommandError) || !error.sensitiveVariableConflict) {
      throw error;
    }

    runCommand("vercel", [
      "env",
      "add",
      name,
      vercelEnvironment,
      "--force",
      "--sensitive",
      "--value",
      value,
      "--yes",
    ]);
  }
}

function getAllowedProviderUrl(rawUrl) {
  const providerUrl = new URL(rawUrl);
  if (
    providerUrl.protocol !== "https:" ||
    providerUrl.username ||
    providerUrl.password ||
    !allowedProviderHosts.has(providerUrl.hostname)
  ) {
    throw new RotationError("UNTRUSTED_PROVIDER_URL", "Provider request URL is not allowlisted");
  }
  return providerUrl;
}

function validateSecretValue(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 8192 ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new RotationError("INVALID_PROVIDER_SECRET", `${label} returned an invalid secret value`);
  }
  return value;
}

function validateProviderIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,512}$/u.test(value)) {
    throw new RotationError("INVALID_PROVIDER_IDENTIFIER", `${label} returned an invalid identifier`);
  }
  return value;
}

async function fetchJson(url, init, label) {
  const providerUrl = getAllowedProviderUrl(url);
  // codeql[js/file-access-to-http] This trusted CLI sends selected credentials only to explicitly allowlisted provider APIs.
  const response = await fetch(providerUrl, init);
  if (!response.ok) {
    throw new RotationError("HTTP_REQUEST_FAILED", `${label} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function rotateAuthSecret(state, summary) {
  if (!shouldRun("auth")) return;

  const nextSecret = randomBytes(32).toString("base64url");
  setEnvValue(state, "AUTH_SECRET", nextSecret);
  setVercelSecret("AUTH_SECRET", nextSecret);
  summary.push(dryRun ? "[dry-run] would rotate AUTH_SECRET" : "rotated AUTH_SECRET");
}

async function rotateOpenRouterKey(state, summary, warnings) {
  if (!shouldRun("openrouter")) return;

  const managementKey = getRuntimeEnvValue("OPENROUTER_MANAGEMENT_API_KEY");
  if (!managementKey) {
    warnings.push("skipped OpenRouter rotation: missing OPENROUTER_MANAGEMENT_API_KEY");
    return;
  }

  const name = `Nodes production ${new Date().toISOString().slice(0, 10)}`;
  const configuredLimit = Number.parseFloat(
    getRuntimeEnvValue("OPENROUTER_ROTATION_LIMIT_USD") || `${defaultOpenRouterRotationLimitUsd}`,
  );
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : defaultOpenRouterRotationLimitUsd;
  let newKey = "<dry-run>";
  let newHash = getRuntimeEnvValue("OPENROUTER_API_KEY_HASH") || "<dry-run-hash>";

  if (!dryRun) {
    const created = await fetchJson(
      "https://openrouter.ai/api/v1/keys",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managementKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, limit }),
      },
      "OpenRouter key creation",
    );

    newKey = validateSecretValue(created?.key, "OpenRouter key creation");
    newHash = validateProviderIdentifier(created?.data?.hash, "OpenRouter key creation");
  }

  const previousHash = getRuntimeEnvValue("OPENROUTER_API_KEY_HASH");
  setEnvValue(state, "OPENROUTER_API_KEY", newKey);
  setEnvValue(state, "OPENROUTER_API_KEY_HASH", newHash);
  setVercelSecret("OPENROUTER_API_KEY", newKey);

  if (!dryRun && previousHash) {
    await fetchJson(
      `https://openrouter.ai/api/v1/keys/${encodeURIComponent(previousHash)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${managementKey}`,
        },
      },
      "OpenRouter key deletion",
    );
    summary.push("rotated OPENROUTER_API_KEY and revoked the previously tracked key");
    return;
  }

  if (previousHash) {
    summary.push(
      dryRun
        ? `[dry-run] would rotate OPENROUTER_API_KEY with a ${limit.toFixed(2)} USD limit and revoke the previously tracked key`
        : `rotated OPENROUTER_API_KEY with a ${limit.toFixed(2)} USD limit and would revoke the previously tracked key`,
    );
    return;
  }

  warnings.push(
    dryRun
      ? `[dry-run] would rotate OPENROUTER_API_KEY with a ${limit.toFixed(2)} USD limit, but the previous runtime key would stay active because OPENROUTER_API_KEY_HASH is not set`
      : `rotated OPENROUTER_API_KEY with a ${limit.toFixed(2)} USD limit but left the previous runtime key active because OPENROUTER_API_KEY_HASH was not set`,
  );
}

function getSupabaseProjectRef() {
  const url = ensureRuntimeEnvValue(
    "SUPABASE_URL",
    "SUPABASE_URL is required for Supabase rotation",
  );
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/i);
  if (!match) {
    throw new RotationError(
      "INVALID_SUPABASE_URL",
      "SUPABASE_URL does not look like a hosted Supabase project URL",
    );
  }
  return match[1];
}

async function rotateSupabaseSecretKey(state, summary, warnings) {
  if (!shouldRun("supabase")) return;

  const accessToken = getRuntimeEnvValue("SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    warnings.push("skipped Supabase rotation: missing SUPABASE_ACCESS_TOKEN");
    return;
  }

  const projectRef = getSupabaseProjectRef();
  const currentKey = ensureRuntimeEnvValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY is required for Supabase rotation",
  );

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  let currentKeyId = "";
  if (!dryRun) {
    const existingKeys = await fetchJson(
      `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
      { headers },
      "Supabase API key listing",
    );

    if (Array.isArray(existingKeys)) {
      const matchedKey = existingKeys.find((entry) => entry?.api_key === currentKey);
      currentKeyId =
        typeof matchedKey?.id === "string"
          ? validateProviderIdentifier(matchedKey.id, "Supabase API key listing")
          : "";
    }
  }

  let nextKey = "<dry-run>";
  if (!dryRun) {
    const created = await fetchJson(
      `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "secret",
          name: `Nodes rotated secret ${new Date().toISOString().slice(0, 10)}`,
          description: "Rotated by scripts/rotate-secrets.mjs",
        }),
      },
      "Supabase API key creation",
    );

    nextKey = validateSecretValue(created?.api_key, "Supabase API key creation");
  }

  setEnvValue(state, "SUPABASE_SERVICE_ROLE_KEY", nextKey);
  setVercelSecret("SUPABASE_SERVICE_ROLE_KEY", nextKey);

  if (!dryRun && currentKeyId) {
    await fetchJson(
      `https://api.supabase.com/v1/projects/${projectRef}/api-keys/${encodeURIComponent(currentKeyId)}?was_compromised=true&reason=${encodeURIComponent("Rotated by scripts/rotate-secrets.mjs")}`,
      {
        method: "DELETE",
        headers,
      },
      "Supabase API key deletion",
    );
    summary.push("rotated SUPABASE_SERVICE_ROLE_KEY and deleted the previous key");
    return;
  }

  if (currentKeyId) {
    summary.push(
      dryRun
        ? "[dry-run] would rotate SUPABASE_SERVICE_ROLE_KEY and delete the previous key"
        : "rotated SUPABASE_SERVICE_ROLE_KEY and would delete the previous key",
    );
    return;
  }

  warnings.push(
    dryRun
      ? "[dry-run] would rotate SUPABASE_SERVICE_ROLE_KEY, but the previous key could not be identified for deletion"
      : "rotated SUPABASE_SERVICE_ROLE_KEY but could not identify the previous key for deletion",
  );
}

async function syncGoogleSecret(summary, warnings) {
  if (!shouldRun("google")) return;

  const googleSecret = getRuntimeEnvValue("AUTH_GOOGLE_SECRET");
  if (!googleSecret) {
    warnings.push("skipped Google sync: add AUTH_GOOGLE_SECRET to .env.local after resetting it in Google Cloud");
    return;
  }

  setVercelSecret("AUTH_GOOGLE_SECRET", googleSecret);
  summary.push(dryRun ? "[dry-run] would sync AUTH_GOOGLE_SECRET to Vercel" : "synced AUTH_GOOGLE_SECRET to Vercel");
}

async function deployProduction(summary) {
  if (!deploy) {
    summary.push("skipped Vercel deploy (--no-deploy)");
    return;
  }

  if (dryRun) {
    summary.push("[dry-run] would deploy production");
    return;
  }

  runCommand("vercel", ["--prod", "--yes"]);
  summary.push("deployed updated secrets to Vercel production");
}

async function main() {
  const rawEnv = await readFile(envFilePath, "utf8");
  const state = readEnvFile(rawEnv);
  const summary = [];
  const warnings = [];

  await rotateAuthSecret(state, summary);
  await rotateOpenRouterKey(state, summary, warnings);
  await rotateSupabaseSecretKey(state, summary, warnings);
  await syncGoogleSecret(summary, warnings);

  if (!dryRun) {
    const serializedEnv = `${state.lines.join("\n").replace(/\n+$/u, "")}\n`;
    await writeFile(envFilePath, serializedEnv, { encoding: "utf8", mode: 0o600 }); // lgtm[js/http-to-file-access] Validated provider secrets are intentionally persisted only to the fixed local .env.local file.
    if (process.platform !== "win32") {
      await chmod(envFilePath, 0o600);
    }
  }

  await deployProduction(summary);

  console.log("Rotation summary:");
  for (const line of summary) {
    console.log(`- ${line}`);
  }

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const line of warnings) {
      console.log(`- ${line}`);
    }
  }
}

main().catch((error) => {
  const code = error instanceof RotationError ? error.code : "UNEXPECTED_INTERNAL_ERROR";
  console.error(`Rotation failed (${code}).`);
  process.exitCode = 1;
});
