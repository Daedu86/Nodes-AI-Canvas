import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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

const shouldRun = (name) => !only || only.has(name);

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

function getEnvValue(state, name) {
  return state.values.get(name)?.trim() ?? "";
}

function ensureEnvValue(state, name, message) {
  const value = getEnvValue(state, name);
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function summarizeStdErr(text) {
  if (!text) {
    return "no stderr/stdout available";
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" | ");
}

function formatCommandForError(command, commandArgs) {
  const redactedArgs = [];
  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];
    redactedArgs.push(arg);
    if (arg === "--value" && index + 1 < commandArgs.length) {
      redactedArgs.push("<redacted>");
      index += 1;
    }
  }
  return `${command} ${redactedArgs.join(" ")}`;
}

function runCommand(command, commandArgs) {
  const printableCommand = formatCommandForError(command, commandArgs);
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
    throw new Error(`${printableCommand} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${printableCommand} failed: ${summarizeStdErr(result.stderr || result.stdout)}`);
  }

  return result.stdout.trim();
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
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Sensitive Environment Variable")) {
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

async function fetchJson(url, init, label) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
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

  const managementKey = getEnvValue(state, "OPENROUTER_MANAGEMENT_API_KEY");
  if (!managementKey) {
    warnings.push("skipped OpenRouter rotation: missing OPENROUTER_MANAGEMENT_API_KEY");
    return;
  }

  const name = `Nodes production ${new Date().toISOString().slice(0, 10)}`;
  const configuredLimit = Number.parseFloat(
    getEnvValue(state, "OPENROUTER_ROTATION_LIMIT_USD") || `${defaultOpenRouterRotationLimitUsd}`,
  );
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : defaultOpenRouterRotationLimitUsd;
  let newKey = "<dry-run>";
  let newHash = getEnvValue(state, "OPENROUTER_API_KEY_HASH") || "<dry-run-hash>";

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

    newKey = created?.key ?? "";
    newHash = created?.data?.hash ?? "";
    if (!newKey || !newHash) {
      throw new Error("OpenRouter key creation returned an incomplete payload");
    }
  }

  const previousHash = getEnvValue(state, "OPENROUTER_API_KEY_HASH");
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

function getSupabaseProjectRef(state) {
  const url = ensureEnvValue(state, "SUPABASE_URL", "SUPABASE_URL is required for Supabase rotation");
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/i);
  if (!match) {
    throw new Error("SUPABASE_URL does not look like a hosted Supabase project URL");
  }
  return match[1];
}

async function rotateSupabaseSecretKey(state, summary, warnings) {
  if (!shouldRun("supabase")) return;

  const accessToken = getEnvValue(state, "SUPABASE_ACCESS_TOKEN");
  if (!accessToken) {
    warnings.push("skipped Supabase rotation: missing SUPABASE_ACCESS_TOKEN");
    return;
  }

  const projectRef = getSupabaseProjectRef(state);
  const currentKey = ensureEnvValue(
    state,
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
      currentKeyId = typeof matchedKey?.id === "string" ? matchedKey.id : "";
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

    nextKey = created?.api_key ?? "";
    if (!nextKey) {
      throw new Error("Supabase API key creation returned an incomplete payload");
    }
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

async function syncGoogleSecret(state, summary, warnings) {
  if (!shouldRun("google")) return;

  const googleSecret = getEnvValue(state, "AUTH_GOOGLE_SECRET");
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
  await syncGoogleSecret(state, summary, warnings);

  if (!dryRun) {
    await writeFile(envFilePath, `${state.lines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
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
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Rotation failed: ${message}`);
  process.exitCode = 1;
});
