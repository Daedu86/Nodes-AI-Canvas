export type Environment = Record<string, string | undefined>;

export type EnvironmentValidationResult = {
  errors: string[];
  warnings: string[];
};

const BOOLEAN_FLAGS = [
  "ALLOW_E2E_AUTH_OVERRIDE",
  "ALLOW_OLLAMA_REMOTE_HOSTS",
  "ALLOW_REMOTE_API",
  "AUTH_ENABLE_AGENT_TOKEN_LOGIN",
  "AUTH_ENABLE_DEV_CREDENTIALS",
  "OPENROUTER_ALLOW_DEPLOYMENT_KEY",
  "OPENROUTER_REQUIRE_USER_KEY",
] as const;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PLACEHOLDER_SECRET_PATTERNS = [
  /replace[-_ ]?with/i,
  /change[-_ ]?me/i,
  /your[-_ ].*key/i,
  /example[-_ ].*secret/i,
  /^password$/i,
  /^secret$/i,
];

const read = (environment: Environment, name: string) => environment[name]?.trim() || "";
const enabled = (environment: Environment, name: string) => read(environment, name) === "1";
const truthy = (environment: Environment, name: string) =>
  ["1", "true", "yes"].includes(read(environment, name).toLowerCase());

const isProductionEnvironment = (environment: Environment) =>
  environment.VERCEL_ENV === "production" ||
  (environment.NODE_ENV === "production" && !environment.VERCEL_ENV);

const addRequired = (
  errors: string[],
  environment: Environment,
  name: string,
  description?: string,
) => {
  if (!read(environment, name)) {
    errors.push(`${name} is required${description ? ` ${description}` : ""}.`);
  }
};

const validateSecret = (
  errors: string[],
  environment: Environment,
  name: string,
  options: { required?: boolean; minLength?: number } = {},
) => {
  const value = read(environment, name);
  if (!value) {
    if (options.required) errors.push(`${name} is required.`);
    return;
  }
  const minLength = options.minLength ?? 32;
  if (value.length < minLength) {
    errors.push(`${name} must contain at least ${minLength} characters.`);
  }
  if (PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    errors.push(`${name} still contains a placeholder value.`);
  }
};

const validateUrl = (
  errors: string[],
  environment: Environment,
  name: string,
  options: { required?: boolean; https?: boolean; nonLoopback?: boolean } = {},
) => {
  const value = read(environment, name);
  if (!value) {
    if (options.required) errors.push(`${name} is required.`);
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${name} must be an absolute URL.`);
    return null;
  }

  if (options.https && parsed.protocol !== "https:") {
    errors.push(`${name} must use https in production.`);
  }
  if (options.nonLoopback && LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    errors.push(`${name} cannot point to a loopback host in production.`);
  }
  return parsed;
};

const validateProviderPair = (
  errors: string[],
  environment: Environment,
  provider: "GitHub" | "Google",
  idName: string,
  secretName: string,
) => {
  const hasId = Boolean(read(environment, idName));
  const hasSecret = Boolean(read(environment, secretName));
  if (hasId !== hasSecret) {
    errors.push(`${provider} OAuth requires both ${idName} and ${secretName}.`);
  }
  return hasId && hasSecret;
};

export function validateEnvironment(environment: Environment): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProductionEnvironment(environment);

  for (const name of BOOLEAN_FLAGS) {
    const value = read(environment, name);
    if (value && value !== "0" && value !== "1") {
      errors.push(`${name} must be either 0 or 1.`);
    }
  }

  const backend = read(environment, "NODES_PERSISTENCE_BACKEND");
  if (backend && backend !== "file" && backend !== "supabase") {
    errors.push("NODES_PERSISTENCE_BACKEND must be either file or supabase.");
  }

  const githubConfigured = validateProviderPair(
    errors,
    environment,
    "GitHub",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
  );
  const googleConfigured = validateProviderPair(
    errors,
    environment,
    "Google",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
  );

  const authSecret = read(environment, "AUTH_SECRET") || read(environment, "NEXTAUTH_SECRET");
  const dedicatedEncryptionSecret =
    read(environment, "LLM_SETTINGS_ENCRYPTION_KEY") ||
    read(environment, "SETTINGS_ENCRYPTION_KEY");
  const agentTokenSecret = read(environment, "AGENT_TOKEN_SECRET");

  if (read(environment, "AUTH_SECRET")) {
    validateSecret(errors, environment, "AUTH_SECRET", { required: production });
  } else if (read(environment, "NEXTAUTH_SECRET")) {
    validateSecret(errors, environment, "NEXTAUTH_SECRET", { required: production });
  } else if (production) {
    errors.push("AUTH_SECRET (or NEXTAUTH_SECRET) is required.");
  }

  if (read(environment, "LLM_SETTINGS_ENCRYPTION_KEY")) {
    validateSecret(errors, environment, "LLM_SETTINGS_ENCRYPTION_KEY");
  }
  if (read(environment, "SETTINGS_ENCRYPTION_KEY")) {
    validateSecret(errors, environment, "SETTINGS_ENCRYPTION_KEY");
  }
  if (agentTokenSecret) {
    validateSecret(errors, environment, "AGENT_TOKEN_SECRET");
  }

  if (dedicatedEncryptionSecret && authSecret && dedicatedEncryptionSecret === authSecret) {
    errors.push("The LLM settings encryption key must not reuse the Auth.js secret.");
  }
  if (agentTokenSecret && authSecret && agentTokenSecret === authSecret) {
    errors.push("AGENT_TOKEN_SECRET must not reuse the Auth.js secret.");
  }
  if (
    agentTokenSecret &&
    dedicatedEncryptionSecret &&
    agentTokenSecret === dedicatedEncryptionSecret
  ) {
    errors.push("AGENT_TOKEN_SECRET must not reuse the LLM settings encryption key.");
  }

  if (enabled(environment, "AUTH_ENABLE_AGENT_TOKEN_LOGIN") && !agentTokenSecret) {
    errors.push("AUTH_ENABLE_AGENT_TOKEN_LOGIN=1 requires AGENT_TOKEN_SECRET.");
  }

  if (enabled(environment, "OPENROUTER_ALLOW_DEPLOYMENT_KEY")) {
    addRequired(
      errors,
      environment,
      "OPENROUTER_API_KEY",
      "when OPENROUTER_ALLOW_DEPLOYMENT_KEY=1",
    );
    validateSecret(errors, environment, "OPENROUTER_API_KEY", { minLength: 16 });
  }
  if (
    enabled(environment, "OPENROUTER_ALLOW_DEPLOYMENT_KEY") &&
    enabled(environment, "OPENROUTER_REQUIRE_USER_KEY")
  ) {
    errors.push(
      "OPENROUTER_ALLOW_DEPLOYMENT_KEY and OPENROUTER_REQUIRE_USER_KEY cannot both be 1.",
    );
  }

  if (production) {
    validateUrl(errors, environment, "NEXTAUTH_URL", {
      required: true,
      https: true,
      nonLoopback: true,
    });

    if (!githubConfigured && !googleConfigured) {
      errors.push(
        "Production requires at least one human OAuth provider: GitHub or Google.",
      );
    }
    if (enabled(environment, "AUTH_ENABLE_DEV_CREDENTIALS")) {
      errors.push("AUTH_ENABLE_DEV_CREDENTIALS must be 0 in production.");
    }
    if (enabled(environment, "ALLOW_E2E_AUTH_OVERRIDE")) {
      errors.push("ALLOW_E2E_AUTH_OVERRIDE must be 0 in production.");
    }
    if (truthy(environment, "E2E_MOCK_LLM")) {
      errors.push("E2E_MOCK_LLM must not be enabled in production.");
    }

    if (backend !== "supabase") {
      errors.push("Production requires NODES_PERSISTENCE_BACKEND=supabase.");
    }
    if (!enabled(environment, "ALLOW_REMOTE_API")) {
      errors.push("Production requires ALLOW_REMOTE_API=1 with Supabase persistence.");
    }
    validateUrl(errors, environment, "SUPABASE_URL", {
      required: true,
      https: true,
      nonLoopback: true,
    });
    validateSecret(errors, environment, "SUPABASE_SERVICE_ROLE_KEY", {
      required: true,
    });

    if (!dedicatedEncryptionSecret) {
      warnings.push(
        "LLM settings encryption is falling back to the Auth.js secret; configure LLM_SETTINGS_ENCRYPTION_KEY for independent key rotation.",
      );
    }

    if (read(environment, "NEXT_PUBLIC_DEFAULT_PROVIDER") === "ollama") {
      if (!enabled(environment, "ALLOW_OLLAMA_REMOTE_HOSTS")) {
        errors.push(
          "NEXT_PUBLIC_DEFAULT_PROVIDER=ollama in production requires ALLOW_OLLAMA_REMOTE_HOSTS=1.",
        );
      }
      validateUrl(errors, environment, "OLLAMA_API_URL", {
        required: true,
        https: true,
        nonLoopback: true,
      });
    }
  }

  return { errors, warnings };
}

export function assertValidEnvironment(environment: Environment) {
  const result = validateEnvironment(environment);
  for (const warning of result.warnings) {
    console.warn(`[environment] ${warning}`);
  }
  if (result.errors.length === 0) return;
  throw new Error(
    `Invalid environment configuration:\n${result.errors.map((error) => `- ${error}`).join("\n")}`,
  );
}
