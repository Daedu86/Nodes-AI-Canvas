import { createHash, randomBytes } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export const PROJECT_INVITATION_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PROJECT_INVITATION_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeInvitationEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function createProjectInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function isValidProjectInvitationToken(value: unknown): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value);
}

export function hashProjectInvitationToken(token: string) {
  if (!isValidProjectInvitationToken(token)) {
    throw new Error("Invalid project invitation token.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function maskInvitationEmail(email: string) {
  const [local = "", domain = ""] = email.split("@", 2);
  const visibleLocal = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  const maskedLocal = `${visibleLocal}${"*".repeat(Math.max(2, local.length - visibleLocal.length))}`;
  const [domainName = "", ...suffixParts] = domain.split(".");
  const visibleDomain = domainName.slice(0, 1);
  const maskedDomain = `${visibleDomain}${"*".repeat(Math.max(2, domainName.length - visibleDomain.length))}`;
  const suffix = suffixParts.length > 0 ? `.${suffixParts.join(".")}` : "";
  return `${maskedLocal}@${maskedDomain}${suffix}`;
}

export function resolveProjectInvitationExpiry(
  value: unknown,
  now = Date.now(),
) {
  if (value === undefined || value === null || value === "") {
    return new Date(now + PROJECT_INVITATION_DEFAULT_TTL_MS).toISOString();
  }
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid project invitation expiry.");
  }
  if (parsed <= now || parsed > now + PROJECT_INVITATION_MAX_TTL_MS) {
    throw new Error("Project invitation expiry must be within the next 30 days.");
  }
  return new Date(parsed).toISOString();
}
