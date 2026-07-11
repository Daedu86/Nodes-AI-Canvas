import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { LlmSettingsState } from "@/lib/llm/user-settings";

const ENCRYPTED_CREDENTIAL_TYPE = "nodes-encrypted-credential";
const ENCRYPTION_VERSION = 1;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_DERIVATION_SALT = Buffer.from("nodes-llm-settings", "utf8");
const KEY_DERIVATION_INFO = Buffer.from("credential-storage-v1", "utf8");

type JsonRecord = Record<string, unknown>;

type EncryptedCredential = {
  __type: typeof ENCRYPTED_CREDENTIAL_TYPE;
  alg: "A256GCM";
  data: string;
  iv: string;
  kid: string;
  tag: string;
  v: typeof ENCRYPTION_VERSION;
};

export type DecodedLlmSettingsCredentials = {
  hasLegacyPlaintextCredentials: boolean;
  settings: unknown;
};

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const cloneJson = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? value : JSON.parse(serialized);
};

const resolveEncryptionSecret = () =>
  process.env.LLM_SETTINGS_ENCRYPTION_KEY?.trim() ||
  process.env.SETTINGS_ENCRYPTION_KEY?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  process.env.NEXTAUTH_SECRET?.trim() ||
  null;

const deriveEncryptionKey = () => {
  const secret = resolveEncryptionSecret();
  if (!secret) {
    throw new Error(
      "LLM credential encryption requires LLM_SETTINGS_ENCRYPTION_KEY or AUTH_SECRET",
    );
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      KEY_DERIVATION_SALT,
      KEY_DERIVATION_INFO,
      KEY_BYTES,
    ),
  );
};

const getKeyId = (key: Buffer) =>
  createHash("sha256").update(key).digest("hex").slice(0, 16);

const buildAdditionalAuthenticatedData = (ownerId: string, credentialPath: string) =>
  Buffer.from(`nodes:llm-settings:v1:${ownerId}:${credentialPath}`, "utf8");

const encryptCredential = (
  ownerId: string,
  credentialPath: string,
  plaintext: string,
): string | EncryptedCredential => {
  if (!plaintext.trim()) return plaintext;

  const key = deriveEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildAdditionalAuthenticatedData(ownerId, credentialPath));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    __type: ENCRYPTED_CREDENTIAL_TYPE,
    alg: "A256GCM",
    data: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    kid: getKeyId(key),
    tag: cipher.getAuthTag().toString("base64"),
    v: ENCRYPTION_VERSION,
  };
};

const parseEncryptedCredential = (value: unknown): EncryptedCredential | null => {
  const record = asRecord(value);
  if (!record || record.__type !== ENCRYPTED_CREDENTIAL_TYPE) return null;

  if (
    record.alg !== "A256GCM" ||
    record.v !== ENCRYPTION_VERSION ||
    typeof record.data !== "string" ||
    typeof record.iv !== "string" ||
    typeof record.kid !== "string" ||
    typeof record.tag !== "string"
  ) {
    throw new Error("Invalid encrypted LLM credential envelope");
  }

  return record as unknown as EncryptedCredential;
};

const decryptCredential = (
  ownerId: string,
  credentialPath: string,
  value: unknown,
): { plaintext: string; wasLegacyPlaintext: boolean } => {
  if (typeof value === "string") {
    return {
      plaintext: value,
      wasLegacyPlaintext: value.trim().length > 0,
    };
  }

  const envelope = parseEncryptedCredential(value);
  if (!envelope) {
    return { plaintext: "", wasLegacyPlaintext: false };
  }

  try {
    const key = deriveEncryptionKey();
    if (envelope.kid !== getKeyId(key)) {
      throw new Error("Encryption key id mismatch");
    }

    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ciphertext = Buffer.from(envelope.data, "base64");
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
      throw new Error("Invalid encrypted credential data");
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(buildAdditionalAuthenticatedData(ownerId, credentialPath));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    return { plaintext, wasLegacyPlaintext: false };
  } catch (error) {
    throw new Error(`Failed to decrypt LLM credential at ${credentialPath}`, {
      cause: error,
    });
  }
};

const transformProviderCredentials = (
  ownerId: string,
  providerName: "ollama" | "openrouter",
  provider: JsonRecord,
) => {
  const apiKeyPath = `providers.${providerName}.apiKey`;
  if (typeof provider.apiKey === "string") {
    provider.apiKey = encryptCredential(ownerId, apiKeyPath, provider.apiKey);
  }

  if (!Array.isArray(provider.apiKeys)) return;
  provider.apiKeys = provider.apiKeys.map((entry, index) => {
    const clonedEntry = asRecord(entry);
    if (!clonedEntry || typeof clonedEntry.key !== "string") return entry;
    clonedEntry.key = encryptCredential(
      ownerId,
      `providers.${providerName}.apiKeys[${index}].key`,
      clonedEntry.key,
    );
    return clonedEntry;
  });
};

const restoreProviderCredentials = (
  ownerId: string,
  providerName: "ollama" | "openrouter",
  provider: JsonRecord,
) => {
  let hasLegacyPlaintextCredentials = false;
  const apiKeyPath = `providers.${providerName}.apiKey`;
  const apiKey = decryptCredential(ownerId, apiKeyPath, provider.apiKey);
  provider.apiKey = apiKey.plaintext;
  hasLegacyPlaintextCredentials ||= apiKey.wasLegacyPlaintext;

  if (Array.isArray(provider.apiKeys)) {
    provider.apiKeys = provider.apiKeys.map((entry, index) => {
      const clonedEntry = asRecord(entry);
      if (!clonedEntry) return entry;
      const decoded = decryptCredential(
        ownerId,
        `providers.${providerName}.apiKeys[${index}].key`,
        clonedEntry.key,
      );
      clonedEntry.key = decoded.plaintext;
      hasLegacyPlaintextCredentials ||= decoded.wasLegacyPlaintext;
      return clonedEntry;
    });
  }

  return hasLegacyPlaintextCredentials;
};

export function encryptLlmSettingsCredentials(
  ownerId: string,
  settings: LlmSettingsState,
): unknown {
  const cloned = cloneJson(settings);
  const root = asRecord(cloned);
  const providers = asRecord(root?.providers);
  if (!root || !providers) return cloned;

  for (const providerName of ["ollama", "openrouter"] as const) {
    const provider = asRecord(providers[providerName]);
    if (provider) transformProviderCredentials(ownerId, providerName, provider);
  }

  return root;
}

export function decryptLlmSettingsCredentials(
  ownerId: string,
  storedSettings: unknown,
): DecodedLlmSettingsCredentials {
  const cloned = cloneJson(storedSettings);
  const root = asRecord(cloned);
  const providers = asRecord(root?.providers);
  if (!root || !providers) {
    return { hasLegacyPlaintextCredentials: false, settings: cloned };
  }

  let hasLegacyPlaintextCredentials = false;
  for (const providerName of ["ollama", "openrouter"] as const) {
    const provider = asRecord(providers[providerName]);
    if (provider) {
      hasLegacyPlaintextCredentials ||=
        restoreProviderCredentials(ownerId, providerName, provider);
    }
  }

  return { hasLegacyPlaintextCredentials, settings: root };
}
