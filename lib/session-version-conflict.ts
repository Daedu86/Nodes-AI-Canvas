import type { SessionDocument } from "@/lib/session-documents";

export const SESSION_VERSION_CONFLICT_CODE = "session_version_conflict" as const;

export class SessionVersionConflictError extends Error {
  readonly code = SESSION_VERSION_CONFLICT_CODE;
  readonly currentSession: SessionDocument;
  readonly expectedVersion: number;

  constructor(expectedVersion: number, currentSession: SessionDocument) {
    super(
      `Session version conflict: expected ${expectedVersion}, current ${currentSession.version}.`,
    );
    this.name = "SessionVersionConflictError";
    this.expectedVersion = expectedVersion;
    this.currentSession = currentSession;
  }
}

export const isSessionVersionConflictError = (
  error: unknown,
): error is SessionVersionConflictError =>
  error instanceof SessionVersionConflictError ||
  (error instanceof Error &&
    "code" in error &&
    error.code === SESSION_VERSION_CONFLICT_CODE &&
    "currentSession" in error);

export const isValidSessionVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
