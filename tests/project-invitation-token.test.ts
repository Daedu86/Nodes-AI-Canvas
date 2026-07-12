import { describe, expect, it } from "vitest";
import {
  createProjectInvitationToken,
  hashProjectInvitationToken,
  isValidProjectInvitationToken,
  maskInvitationEmail,
  normalizeInvitationEmail,
  resolveProjectInvitationExpiry,
} from "../lib/server/project-invitation-token";

describe("project invitation tokens", () => {
  it("generates high-entropy URL-safe tokens and stores only deterministic hashes", () => {
    const first = createProjectInvitationToken();
    const second = createProjectInvitationToken();
    expect(first).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(isValidProjectInvitationToken(first)).toBe(true);
    expect(hashProjectInvitationToken(first)).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashProjectInvitationToken(first)).not.toContain(first);
  });

  it("normalizes valid emails and rejects malformed values", () => {
    expect(normalizeInvitationEmail(" Person@Example.COM ")).toBe("person@example.com");
    expect(normalizeInvitationEmail("invalid")) .toBeNull();
    expect(normalizeInvitationEmail("a@b")) .toBeNull();
  });

  it("masks recipient emails in public previews", () => {
    const masked = maskInvitationEmail("person@example.com");
    expect(masked).toContain("@");
    expect(masked).not.toContain("person");
    expect(masked).not.toContain("example");
  });

  it("bounds invitation expiry to thirty days", () => {
    const now = Date.parse("2026-07-12T21:00:00.000Z");
    expect(Date.parse(resolveProjectInvitationExpiry(undefined, now))).toBe(
      now + 7 * 24 * 60 * 60 * 1000,
    );
    expect(() => resolveProjectInvitationExpiry(now - 1, now)).toThrow();
    expect(() => resolveProjectInvitationExpiry(now + 31 * 24 * 60 * 60 * 1000, now)).toThrow();
  });
});
