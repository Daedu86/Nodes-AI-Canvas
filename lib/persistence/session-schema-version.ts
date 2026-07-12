export const CURRENT_SESSION_SCHEMA_VERSION = 1;

export class UnsupportedSessionSchemaVersionError extends Error {
  readonly schemaVersion: number;

  constructor(schemaVersion: number) {
    super(`Unsupported session schema version: ${schemaVersion}`);
    this.name = "UnsupportedSessionSchemaVersionError";
    this.schemaVersion = schemaVersion;
  }
}

const parsePositiveInteger = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function resolveSessionSchemaVersion(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return CURRENT_SESSION_SCHEMA_VERSION;
  }

  const parsed = parsePositiveInteger(value);
  if (parsed === null) {
    throw new Error("Invalid session schema version.");
  }
  if (parsed !== CURRENT_SESSION_SCHEMA_VERSION) {
    throw new UnsupportedSessionSchemaVersionError(parsed);
  }
  return parsed;
}

export function resolveMaterializedMessageCount(
  value: unknown,
  fallback: () => number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback();
}
